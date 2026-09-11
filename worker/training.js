import { HttpError, validateSubmission } from './validation.js';
import { exactFields, textValue } from './identity.js';
import { audit, identifier } from './learning.js';

const cohort = row => ({ id:row.id, title:row.title, year:row.year, quarter:row.quarter, status:row.status, opensAt:row.opens_at, closesAt:row.closes_at, startsAt:row.starts_at, format:row.format, details:row.details, tuitionNote:row.tuition_note, version:row.version });
export async function cohorts(db) {
  const { results } = await db.prepare('SELECT * FROM training_cohorts ORDER BY year,quarter LIMIT 100').all();
  const now = Date.now();
  return { windows: [{ quarter:1, label:'Early-year intake', months:'January-March' }, { quarter:4, label:'Late-year intake', months:'October-December' }], cohorts:results.map(row => ({ ...cohort(row), acceptingApplications:row.status === 'open' && Date.parse(row.opens_at) <= now && Date.parse(row.closes_at) > now })) };
}
export async function myApplications(db, user) {
  const { results } = await db.prepare('SELECT a.*,c.title AS cohort_title,c.year,c.quarter,c.starts_at,c.tuition_note FROM training_applications a JOIN training_cohorts c ON c.id=a.cohort_id WHERE a.user_id=? ORDER BY a.updated_at DESC LIMIT 100').bind(user.id).all();
  return { applications: results.map(row => ({ id:row.id, cohortId:row.cohort_id, cohortTitle:row.cohort_title, year:row.year, quarter:row.quarter, startsAt:row.starts_at, tuitionNote:row.tuition_note, status:row.status, data:JSON.parse(row.data_json), version:row.version, submittedAt:row.submitted_at, updatedAt:row.updated_at })) };
}
function draftData(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Application details are required.');
  exactFields(input, ['track','format','experience','goals','phone']);
  const data = {};
  for (const [key,max] of [['track',80],['experience',1000],['goals',2000],['phone',30]]) data[key] = textValue(input[key] ?? '', 0, max, key);
  if (!['online','physical','undecided'].includes(input.format)) throw new HttpError(400, 'Choose a preferred training format.');
  data.format = input.format;
  return data;
}
export async function saveApplication(db, user, cohortId, input) {
  exactFields(input, ['data','version','submit','consent']);
  if (!Number.isSafeInteger(input.version) || input.version < 0 || typeof input.submit !== 'boolean') throw new HttpError(400, 'Invalid application version or action.');
  const currentCohort = await db.prepare('SELECT * FROM training_cohorts WHERE id=?').bind(identifier(cohortId)).first();
  if (!currentCohort) throw new HttpError(404, 'Intake not found.');
  const data = draftData(input.data), now = new Date().toISOString();
  if (input.submit) {
    if (currentCohort.status !== 'open' || !(Date.parse(currentCohort.opens_at) <= Date.now() && Date.parse(currentCohort.closes_at) > Date.now())) throw new HttpError(409, 'This intake is not accepting applications. You can still save a draft.');
    validateSubmission({ ...data, name:user.name, email:user.email, consent:input.consent }, 'applications');
  }
  const previous = await db.prepare('SELECT * FROM training_applications WHERE user_id=? AND cohort_id=?').bind(user.id,cohortId).first();
  if (previous && !['draft','withdrawn'].includes(previous.status)) throw new HttpError(409, 'This application was already submitted. Contact the team if it needs a correction.');
  if ((previous?.version || 0) !== input.version) throw new HttpError(409, 'This draft changed in another tab. Reload before saving.');
  const id = previous?.id || crypto.randomUUID(), status = input.submit ? 'submitted' : 'draft';
  const row = await db.prepare(`INSERT INTO training_applications(id,user_id,cohort_id,status,data_json,consent_at,submitted_at,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,? WHERE ?=0 OR EXISTS (SELECT 1 FROM training_cohorts WHERE id=? AND status='open' AND opens_at<=? AND closes_at>?)
    ON CONFLICT(user_id,cohort_id) DO UPDATE SET status=excluded.status,data_json=excluded.data_json,
    consent_at=excluded.consent_at,submitted_at=excluded.submitted_at,updated_at=excluded.updated_at,version=version+1
    WHERE version=? AND status IN ('draft','withdrawn') RETURNING id,version,status`)
    .bind(id,user.id,cohortId,status,JSON.stringify(data),input.submit ? now : null,input.submit ? now : null,now,now,input.submit ? 1 : 0,cohortId,now,now,input.version).first();
  if (!row) throw new HttpError(409, 'This draft changed. Reload before saving.');
  await audit(db,'application',row.id,status,user.id);
  return { application:row };
}
export async function withdrawApplication(db, user, id, input) {
  exactFields(input, ['version']);
  const row = await db.prepare("UPDATE training_applications SET status='withdrawn',version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=? AND status NOT IN ('declined','withdrawn') RETURNING id,status,version")
    .bind(new Date().toISOString(),identifier(id),user.id,input.version).first();
  if (!row) throw new HttpError(409, 'This application cannot be withdrawn, or it changed. Reload and try again.');
  await audit(db,'application',id,'withdrawn',user.id);
  return { application:row };
}
function dateValue(value, label) {
  if (value === null || value === '' || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new HttpError(400, `${label} must be a valid UTC date.`);
  return value;
}
export async function saveCohort(db, input) {
  exactFields(input, ['id','title','year','quarter','status','opensAt','closesAt','startsAt','format','details','tuitionNote','version']);
  const id = identifier(input.id), title = textValue(input.title,5,140,'Intake title');
  if (!Number.isSafeInteger(input.year) || input.year < 2026 || input.year > 2100 || ![1,4].includes(input.quarter)) throw new HttpError(400, 'Choose a year and either Q1 or Q4.');
  if (!['planned','open','closed'].includes(input.status) || !['online','physical','hybrid'].includes(input.format)) throw new HttpError(400, 'Invalid intake status or delivery format.');
  if (!Number.isSafeInteger(input.version) || input.version < 0) throw new HttpError(400, 'Invalid intake version.');
  const opens = dateValue(input.opensAt,'Opening'), closes = dateValue(input.closesAt,'Closing'), starts = dateValue(input.startsAt,'Start');
  const details = textValue(input.details,20,2000,'Intake details'), tuition = textValue(input.tuitionNote,10,1000,'Tuition and fee information');
  if (input.status === 'open' && (!opens || !closes || !starts || !(opens < closes && closes <= starts))) throw new HttpError(400, 'Opening an intake requires ordered opening, closing and training-start dates, plus fee information.');
  if (starts) { const date = new Date(starts); if (date.getUTCFullYear() !== input.year || Math.floor(date.getUTCMonth()/3)+1 !== input.quarter) throw new HttpError(400, 'The start date must fall in the selected year and quarter.'); }
  const existing = await db.prepare('SELECT version FROM training_cohorts WHERE id=?').bind(id).first();
  if ((existing?.version || 0) !== input.version) throw new HttpError(409, 'This intake changed. Reload it before saving.');
  const duplicate = await db.prepare('SELECT id FROM training_cohorts WHERE year=? AND quarter=? AND id<>?').bind(input.year,input.quarter,id).first();
  if (duplicate) throw new HttpError(409, 'An intake already exists for that year and quarter.');
  const now = new Date().toISOString();
  const row = await db.prepare(`INSERT INTO training_cohorts(id,title,year,quarter,status,opens_at,closes_at,starts_at,format,details,tuition_note,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,year=excluded.year,quarter=excluded.quarter,status=excluded.status,
    opens_at=excluded.opens_at,closes_at=excluded.closes_at,starts_at=excluded.starts_at,format=excluded.format,details=excluded.details,tuition_note=excluded.tuition_note,updated_at=excluded.updated_at,version=version+1
    WHERE version=? RETURNING *`).bind(id,title,input.year,input.quarter,input.status,opens,closes,starts,input.format,details,tuition,now,now,input.version).first();
  if (!row) throw new HttpError(409, 'This intake changed. Reload and try again.');
  await audit(db,'cohort',id,input.status);
  return { cohort:cohort(row) };
}
export async function applicationsForStaff(db) {
  const { results } = await db.prepare("SELECT a.*,u.name,u.email,c.title AS cohort_title FROM training_applications a JOIN learner_users u ON u.id=a.user_id JOIN training_cohorts c ON c.id=a.cohort_id WHERE a.status<>'draft' ORDER BY a.updated_at DESC LIMIT 100").all();
  return { applications:results.map(row => ({ id:row.id, name:row.name, email:row.email, cohortTitle:row.cohort_title, status:row.status, version:row.version, data:JSON.parse(row.data_json), submittedAt:row.submitted_at })) };
}
export async function reviewApplication(db, id, input) {
  exactFields(input, ['status','version']);
  if (!['under-review','offered','declined'].includes(input.status)) throw new HttpError(400, 'Choose an application review status.');
  const row = await db.prepare("UPDATE training_applications SET status=?,version=version+1,updated_at=? WHERE id=? AND version=? AND status IN ('submitted','under-review') RETURNING id,status,version")
    .bind(input.status,new Date().toISOString(),identifier(id),input.version).first();
  if (!row) throw new HttpError(409, 'The application changed or cannot make that transition.');
  await audit(db,'application',id,input.status);
  return { application:row };
}
