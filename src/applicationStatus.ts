type StatusInfo = { label: string; tone: string; heading: string; next: string; action: string };

const statuses: Record<string, StatusInfo> = {
  draft: { label: 'Draft', tone: 'neutral', heading: 'Make it yours before you submit.', next: 'Your draft is saved, but is not under review. Complete your details and submit while applications are open.', action: 'Continue draft' },
  submitted: { label: 'Submitted', tone: 'blue', heading: 'Your application has been submitted.', next: 'No further submission is needed. Check here for a review update. A review date has not been promised.', action: 'View application' },
  'under-review': { label: 'Under review', tone: 'blue', heading: 'The team is reviewing your application.', next: 'Your details are locked during review. Check this dashboard for the outcome; no decision date is confirmed.', action: 'View application' },
  offered: { label: 'Offer made', tone: 'aqua', heading: 'An offer, not yet a confirmed place.', next: 'Confirm the start date, format and fees with the team before making arrangements. No payment is collected here.', action: 'View application' },
  declined: { label: 'Not offered', tone: 'neutral', heading: 'No offer for this application.', next: 'This application is closed. You can explore another announced intake or continue with self-paced learning.', action: 'View application' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral', heading: 'This application is no longer in review.', next: 'You can edit your details and submit again while this intake is accepting applications.', action: 'Revisit application' },
};

export function applicationStatus(status: string): StatusInfo {
  return Object.hasOwn(statuses, status) ? statuses[status] : { label: 'Status unavailable', tone: 'neutral', heading: 'Check your application details.', next: 'We cannot describe this status yet. Contact the team if you need clarification.', action: 'View application' };
}
