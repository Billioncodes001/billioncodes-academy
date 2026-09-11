import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { fetch as expoFetch } from 'expo/fetch';
import { useFonts } from 'expo-font';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { DMSans_400Regular } from '@expo-google-fonts/dm-sans/400Regular';
import { DMSans_500Medium } from '@expo-google-fonts/dm-sans/500Medium';
import { DMSans_700Bold } from '@expo-google-fonts/dm-sans/700Bold';
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import {
  challenges, MAX_CODE_LENGTH, primer, recordRead,
  rememberLesson, saveDraft, type Catalog, type Course, type Feedback,
} from '@billioncodes/learning';
import { downloadStore, progressStore } from './src/device';
import { fetchCatalog, PUBLIC_SITE, TRAINING_URL } from './src/catalog';
import { checkAttempt } from './src/practice';

const color = {
  ink: '#152b3a', muted: '#51616b', paper: '#faf8f2', white: '#ffffff',
  lime: '#d2f65a', coral: '#ed6541', line: '#d9ded7', soft: '#edf0e7', error: '#913820',
};
const font = { display: 'BricolageGrotesque_600SemiBold', body: 'DMSans_400Regular', medium: 'DMSans_500Medium', bold: 'DMSans_700Bold', mono: 'IBMPlexMono_400Regular' };
type Tab = 'Desk' | 'Lessons' | 'Practice' | 'Device';
type Network = { phase: 'loading' | 'ready' | 'error'; catalog: Catalog | null; error?: string };
type Confirmation = { title: string; detail: string; action: () => void };

function Button({ label, onPress, disabled = false, tone = 'ink', testID }: {
  label: string; onPress: () => void; disabled?: boolean; tone?: 'ink' | 'light' | 'lime' | 'danger'; testID?: string;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} testID={testID}
    style={({ pressed }) => [s.button, tone === 'light' && s.buttonLight, tone === 'lime' && s.buttonLime,
      tone === 'danger' && s.buttonDanger, pressed && s.pressed, disabled && s.disabled]}>
    <Text style={[s.buttonText, (tone === 'light' || tone === 'lime') && s.buttonTextDark]}>{label}</Text>
  </Pressable>;
}

function Label({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <Text style={[s.label, light && s.labelLight]}>{children}</Text>;
}

function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <View accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[s.notice, error && s.noticeError]}>
    <Text style={[s.body, error && { color: color.error }]}>{children}</Text>
  </View>;
}

function Heading({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return <View style={s.heading}><Label>{label}</Label><Text accessibilityRole="header" style={s.h1}>{title}</Text>{children}</View>;
}

function LearningDesk() {
  const workspace = useSyncExternalStore(progressStore.subscribe, progressStore.getSnapshot, progressStore.getSnapshot);
  const download = useSyncExternalStore(downloadStore.subscribe, downloadStore.getSnapshot, downloadStore.getSnapshot);
  const progress = workspace.value;
  const [tab, setTab] = useState<Tab>('Desk');
  const [network, setNetwork] = useState<Network>({ phase: 'loading', catalog: null });
  const [reload, setReload] = useState(0);
  const [courseId, setCourseId] = useState(primer.id);
  const [lessonId, setLessonId] = useState(primer.lessons[0].id);
  const [challengeId, setChallengeId] = useState(challenges[0].id);
  const [feedback, setFeedback] = useState<Record<string, { code: string; result: Feedback }>>({});
  const [showHint, setShowHint] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();

  useEffect(() => { void progressStore.hydrate(); void downloadStore.hydrate(); }, []);
  useEffect(() => {
    let active = true;
    setNetwork({ phase: 'loading', catalog: null });
    fetchCatalog(expoFetch as typeof fetch).then(catalog => {
      if (active) setNetwork({ phase: 'ready', catalog });
    }).catch(error => {
      if (active) setNetwork({ phase: 'error', catalog: null, error: error instanceof Error ? error.message : 'Could not reach the catalog.' });
    });
    return () => { active = false; };
  }, [reload]);
  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, [tab, courseId, lessonId, challengeId]);

  const saved = download.value;
  const catalog = network.catalog ?? saved?.catalog ?? null;
  const usingDownload = !network.catalog && !!saved;
  const courses = [primer, ...(catalog?.courses ?? []).filter(course => course.id !== primer.id)];
  const course = courses.find(item => item.id === courseId);
  const lesson = course?.lessons.find(item => item.id === lessonId);
  const challenge = challenges.find(item => item.id === challengeId)!;
  const code = progress.drafts[challenge.id] ?? challenge.starter;
  const checked = feedback[challenge.id];
  const currentFeedback = checked?.code === code ? checked.result : null;
  const canEdit = workspace.phase === 'ready';
  const canDownload = download.phase === 'ready' && download.pending === 0 && network.phase === 'ready';
  const readCount = courses.reduce((count, item) => count + item.lessons.filter(lesson => progress.read[item.id]?.includes(lesson.id)).length, 0);
  const solvedCount = Object.keys(progress.solved).length;
  const lastCourse = courses.find(item => item.id === progress.lastLesson?.courseId);
  const lastLesson = lastCourse?.lessons.find(item => item.id === progress.lastLesson?.lessonId);

  function openLesson(nextCourse: Course, nextLessonId = nextCourse.lessons[0]?.id) {
    setCourseId(nextCourse.id);
    setLessonId(nextLessonId ?? '');
    setTab('Lessons');
    if (nextLessonId) void progressStore.update(value => rememberLesson(value, nextCourse.id, nextLessonId));
  }

  function openWeb(url: string) {
    setLinkError(null);
    void Linking.openURL(url).catch(() => setLinkError(`Could not open your browser. Visit ${url}`));
  }

  function resetProgress() {
    setConfirmation({ title: 'Reset learning progress?', detail: 'Remove read marks, all four drafts, checked solutions and your last lesson on this device. Your catalog download will stay.', action: () => {
      void progressStore.reset(); setFeedback({});
    } });
  }

  function removeDownload() {
    setConfirmation({ title: 'Remove saved catalog?', detail: 'Remove downloaded lessons from this device. Your learning progress and the bundled HTML primer will stay. Reading live lessons offline will need a new download.', action: () => { void downloadStore.reset(); } });
  }

  const catalogStatus = <View style={s.stack}>
    <View style={s.sectionLine}><Label>{network.phase === 'ready' ? 'LIVE CATALOG' : usingDownload ? 'SAVED CATALOG' : 'CATALOG CONNECTION'}</Label>
      {network.phase === 'loading' && <ActivityIndicator accessibilityLabel="Checking live catalog" color={color.ink} />}</View>
    {network.phase === 'loading' && <Text style={s.small}>{usingDownload ? 'Reading your saved copy while checking for current lessons.' : 'Checking the public catalog. The bundled primer is available below.'}</Text>}
    {network.phase === 'error' && <Notice error>{network.error} {usingDownload ? 'Your saved download is available below; it may be out of date.' : 'No live lessons are being substituted. The bundled primer and practice still work.'}</Notice>}
    {usingDownload && <Text style={s.small}>Saved {new Date(saved!.savedAt).toLocaleString()}. This is not a live response.</Text>}
    {network.phase === 'ready' && <Text style={s.small}>Current public lessons from learnatbillioncodes.com. Download explicitly to keep a copy for offline reading.</Text>}
    {catalog && catalog.courses.length === 0 && <Notice>The public catalog has no courses yet. The bundled primer is separate and available now.</Notice>}
    <View style={s.actions}>
      <Button label={network.phase === 'loading' ? 'Checking catalog...' : 'Refresh catalog'} disabled={network.phase === 'loading'} onPress={() => setReload(value => value + 1)} tone="light" />
      <Button label={download.pending ? 'Saving download...' : saved ? 'Update offline download' : 'Download catalog'} disabled={!canDownload} onPress={() => {
        if (network.catalog) void downloadStore.update(() => ({ version: 1, savedAt: new Date().toISOString(), catalog: network.catalog! }));
      }} tone="light" />
    </View>
  </View>;

  const courseCards = courses.map((item, index) => <Pressable key={item.id} accessibilityRole="button"
    accessibilityLabel={`Read ${item.title}`} onPress={() => openLesson(item)} style={({ pressed }) => [s.courseCard, index === 0 && s.primerCard, pressed && s.pressed]}>
    <View style={s.sectionLine}><Label>{index === 0 ? 'BUNDLED / ALWAYS AVAILABLE' : usingDownload ? 'DOWNLOADED / TEXT LESSONS' : 'LIVE / TEXT LESSONS'}</Label><Text style={s.cardNumber}>{String(index + 1).padStart(2, '0')}</Text></View>
    <Text accessibilityRole="header" style={s.h2}>{item.title}</Text>
    <Text style={s.body}>{item.summary}</Text>
    <View style={s.sectionLine}><Text style={s.small}>{item.lessons.length} lessons / {item.level}</Text><Text style={s.arrow}>↗</Text></View>
  </Pressable>);

  return <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
    <StatusBar style="dark" />
    <View style={s.topBar}><View style={s.brand}><Image source={require('./assets/icon-192.png')} style={s.brandMark} resizeMode="contain" accessible={false} testID="brand-monogram" /><Text style={s.brandText}>Billion Codes<Text style={{ color: color.coral }}>.</Text></Text></View><Text style={s.edition}>LEARNING DESK</Text></View>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={[s.content, width > 900 && s.wide]}>
          {workspace.phase === 'loading' && <Notice>Opening this device's progress. Editing is paused until it is safe to save.</Notice>}
          {workspace.error && <View style={s.stack}><Notice error>{workspace.error}</Notice><Button label={workspace.phase === 'blocked' ? 'Retry reading progress' : 'Retry saving progress'} onPress={() => { void (workspace.phase === 'blocked' ? progressStore.hydrate() : progressStore.retryWrite()); }} tone="light" /></View>}
          {download.error && <View style={s.stack}><Notice error>Catalog storage: {download.error}</Notice><Button label={download.phase === 'blocked' ? 'Retry reading download' : 'Retry saving download'} onPress={() => { void (download.phase === 'blocked' ? downloadStore.hydrate() : downloadStore.retryWrite()); }} tone="light" /></View>}
          {linkError && <Notice error>{linkError}</Notice>}

          {tab === 'Desk' && <>
            <View style={s.hero}>
              <View style={s.heroTop}><Label light>YOUR NEXT LINE STARTS HERE</Label><View style={s.liveDot} /></View>
              <Text accessibilityRole="header" style={s.heroTitle}>Small steps.{`\n`}Real understanding.</Text>
              <Text style={s.heroBody}>A quiet place to read, write HTML, and make an idea your own.</Text>
              <View style={s.deskDrawing} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <View style={s.drawingTop}><Text style={s.drawingLabel}>field-notes.html</Text><Text style={s.drawingLabel}>01</Text></View>
                <Text style={s.drawingCode}>{'<main>\n  <h1>Start somewhere.</h1>\n  <p>Make it meaningful.</p>\n</main>'}</Text>
              </View>
              <Button label={lastLesson ? 'Continue last lesson' : 'Begin the HTML primer'} onPress={() => openLesson(lastLesson ? lastCourse! : primer, lastLesson?.id)} tone="lime" />
            </View>
            <View style={s.stats}><View style={s.stat}><Text style={s.statValue}>{readCount.toString().padStart(2, '0')}</Text><Text style={s.small}>lessons marked read</Text></View><View style={s.stat}><Text style={s.statValue}>{solvedCount.toString().padStart(2, '0')}<Text style={s.statOf}> / 04</Text></Text><Text style={s.small}>exercises checked</Text></View></View>
            <Text style={s.small}>Your own practice record, on this device only. No account, sync, grade or certification.</Text>
            <View style={s.sectionLine}><Text accessibilityRole="header" style={s.h2}>A place to begin.</Text><Label>READ / THINK / BUILD</Label></View>
            {courseCards}
            <View style={s.practiceTeaser}><Label>THE PRACTICE LAB</Label><Text style={s.h2}>Less watching.{`\n`}More making.</Text><Text style={s.body}>Four small HTML exercises. Write real markup and check the structure, one goal at a time.</Text><Button label="Open HTML practice" onPress={() => setTab('Practice')} tone="ink" /></View>
            {catalogStatus}
            <View style={s.training}><Text style={s.h2}>Learn with a little guidance.</Text><Text style={s.body}>Ask about training on our public website. An application is an expression of interest, not a booking.</Text><Button label="Training on the web" onPress={() => openWeb(TRAINING_URL)} tone="light" /><Text style={s.small}>Opens your browser. No enquiry or personal details are submitted by this app.</Text></View>
          </>}

          {tab === 'Lessons' && <>
            <Heading label="THE READING ROOM" title="Meaning before decoration."><Text style={s.body}>Text lessons you can take at your own pace.</Text></Heading>
            {catalogStatus}
            <View style={s.stack}>{courses.map(item => <Button key={item.id} label={`Read ${item.title}`} tone={courseId === item.id ? 'ink' : 'light'} onPress={() => openLesson(item)} />)}</View>
            {!course && <Notice>The selected live course is not available right now. Refresh the catalog or open the bundled primer above.</Notice>}
            {course && <View style={s.stack}>
              <View style={s.readerHeader}><Label>{course.id === primer.id ? 'BUNDLED PRIMER' : usingDownload ? 'SAVED DOWNLOAD' : 'LIVE CATALOG'}</Label><Text accessibilityRole="header" style={s.h2}>{course.title}</Text><Text style={s.small}>{course.lessons.length} text lessons / Device-only read marks</Text></View>
              {course.lessons.length === 0 && <Notice>This course has no text lessons available yet.</Notice>}
              <View style={s.lessonList}>{course.lessons.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Lesson ${index + 1}: ${item.title}`} accessibilityState={{ selected: item.id === lessonId }} onPress={() => openLesson(course, item.id)} style={({ pressed }) => [s.lessonButton, item.id === lessonId && s.lessonSelected, pressed && s.pressed]}><Text style={s.lessonIndex}>{String(index + 1).padStart(2, '0')}</Text><Text style={s.lessonTitle}>{item.title}</Text>{progress.read[course.id]?.includes(item.id) && <Text style={s.readLabel}>READ</Text>}</Pressable>)}</View>
              {lesson && <View style={s.article}>
                <Label>FIELD NOTE / {String(course.lessons.indexOf(lesson) + 1).padStart(2, '0')}</Label>
                <Text accessibilityRole="header" style={s.articleTitle}>{lesson.title}</Text>
                {lesson.body.map((paragraph, index) => <Text selectable key={index} style={paragraph.includes('\n') ? s.lessonCode : s.paragraph}>{paragraph}</Text>)}
                <View style={s.divider} />
                <Button label={progress.read[course.id]?.includes(lesson.id) ? 'Unmark as read' : 'Mark lesson as read'} disabled={!canEdit} tone="lime" onPress={() => { void progressStore.update(value => recordRead(value, course.id, lesson.id, !value.read[course.id]?.includes(lesson.id))); }} />
                <View style={s.actions}>
                  {course.lessons.indexOf(lesson) > 0 && <Button label="Previous lesson" tone="light" onPress={() => openLesson(course, course.lessons[course.lessons.indexOf(lesson) - 1].id)} />}
                  {course.lessons.indexOf(lesson) < course.lessons.length - 1 ? <Button label="Next lesson" tone="ink" onPress={() => openLesson(course, course.lessons[course.lessons.indexOf(lesson) + 1].id)} /> : <Button label="Try HTML practice" onPress={() => setTab('Practice')} />}
                </View>
              </View>}
            </View>}
          </>}

          {tab === 'Practice' && <>
            <Heading label="FOUR SMALL EXPERIMENTS" title="Make your next line count."><Text style={s.body}>Real HTML. Shared structure checks. No scripts run, no forms submit, and no learner URLs open.</Text></Heading>
            <View style={s.challengeGrid}>{challenges.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Exercise ${index + 1}: ${item.title}`} accessibilityState={{ selected: item.id === challengeId }} onPress={() => { setChallengeId(item.id); setShowHint(false); }} style={({ pressed }) => [s.challengeTab, item.id === challengeId && s.challengeActive, pressed && s.pressed]}>
              <Text style={[s.challengeNumber, item.id === challengeId && s.onInk]}>{String(index + 1).padStart(2, '0')} {progress.solved[item.id] ? '/ CHECKED' : ''}</Text><Text style={[s.challengeName, item.id === challengeId && s.onInk]}>{item.title}</Text>
            </Pressable>)}</View>
            <View style={s.stack}><Label>EXERCISE {challenges.indexOf(challenge) + 1} / ABOUT {challenge.minutes} MINUTES</Label><Text accessibilityRole="header" style={s.h2}>{challenge.title}</Text><Text style={s.body}>{challenge.brief}</Text></View>
            <View style={s.editorFrame}><View style={s.editorBar}><Text style={s.editorFile}>{challenge.id}.html</Text><Text style={s.editorMeta}>{code.length} / {MAX_CODE_LENGTH}</Text></View>
              <TextInput accessibilityLabel="HTML code editor" accessibilityHint="Multiline plain-text HTML. Code is checked, never executed." testID="html-editor" value={code}
                editable={canEdit} multiline autoCorrect={false} autoCapitalize="none" spellCheck={false} maxLength={MAX_CODE_LENGTH} textAlignVertical="top"
                onChangeText={value => { void progressStore.update(current => saveDraft(current, challenge.id, value)); }} style={s.editor} />
              <View style={s.editorFooter}><Text accessibilityLiveRegion="polite" style={s.editorMeta}>{workspace.error ? 'Not saved: retry device storage' : workspace.pending ? 'Saving on this device...' : canEdit ? 'Device-local draft / never uploaded' : 'Waiting for safe storage'}</Text></View>
            </View>
            <View style={s.actions}><Button label="Check my HTML" disabled={!canEdit} onPress={() => {
              const attempt = checkAttempt(progressStore.getSnapshot().value, challenge.id, code);
              setFeedback(value => ({ ...value, [challenge.id]: { code, result: attempt.feedback } }));
              void progressStore.update(() => attempt.progress);
            }} tone="lime" /><Button label={showHint ? 'Hide hint' : 'Show a hint'} tone="light" onPress={() => setShowHint(value => !value)} /></View>
            {showHint && <Notice>{challenge.hint}</Notice>}
            {checked && !currentFeedback && <Notice>Your draft changed. Check again for feedback on this version.</Notice>}
            <View style={s.feedback} accessibilityLiveRegion="polite"><Label>{currentFeedback ? currentFeedback.passed ? 'ALL GOALS MET / ON THIS ATTEMPT' : 'KEEP BUILDING / GOAL FEEDBACK' : 'YOUR CHECKLIST'}</Label>
              {currentFeedback?.error && <Notice error>{currentFeedback.error}</Notice>}
              {(currentFeedback?.checks ?? challenge.goals.map(label => ({ label, passed: false }))).map((check, index) => <View style={s.checkRow} key={index}><Text style={[s.checkIcon, currentFeedback && check.passed && s.checkPassed]}>{currentFeedback ? check.passed ? 'OK' : 'FIX' : String(index + 1).padStart(2, '0')}</Text><Text style={s.checkText}>{check.label}</Text></View>)}
              <Text style={s.small}>These checks look for a few HTML structures. They are not a complete accessibility audit, certification, or browser rendering.</Text>
            </View>
            <View style={s.stack}><Label>PLAIN TEXT, NOT A WEBVIEW</Label><Text style={s.body}>Your editor shows the source exactly as text. Links, scripts and form controls are intentionally inert. Native rendering of learner HTML is not enabled.</Text><Button label="Restore starter code" tone="light" disabled={!canEdit} onPress={() => setConfirmation({ title: 'Restore this starter?', detail: 'Replace only this exercise draft. Your previously checked solution and other exercises will stay.', action: () => { void progressStore.update(value => saveDraft(value, challenge.id, challenge.starter)); setFeedback(value => { const next = { ...value }; delete next[challenge.id]; return next; }); } })} /></View>
          </>}

          {tab === 'Device' && <>
            <Heading label="YOUR DEVICE, YOUR NOTES" title="Keep what helps. Clear what doesn't."><Text style={s.body}>No learner account. No cloud sync. No payments. This app stores only your learning record and the catalog you choose to download.</Text></Heading>
            <View style={s.deviceCard}><Label>01 / LEARNING RECORD</Label><Text style={s.h2}>Progress stays here.</Text><Text style={s.body}>Read marks, four exercise drafts, checked solution text, and your last lesson are saved in this app's device storage. They do not sync with the website or another device.</Text><Text accessibilityLiveRegion="polite" style={s.small}>{workspace.phase === 'loading' ? 'Reading storage...' : workspace.phase === 'blocked' ? 'Storage is blocked. Retry reading or explicitly reset.' : workspace.error ? 'Storage needs attention; changes are only in memory.' : workspace.pending ? 'Saving changes...' : 'Device storage is ready.'}</Text><Button label="Reset learning progress" disabled={workspace.phase === 'loading' || workspace.pending > 0} tone="danger" onPress={resetProgress} /></View>
            <View style={s.deviceCard}><Label>02 / OFFLINE READING</Label><Text style={s.h2}>Pack a few lessons.</Text>
              {saved ? <><Text style={s.body}>{saved.catalog.courses.length} courses in your saved catalog.</Text><Text testID="saved-date" style={s.small}>Saved {new Date(saved.savedAt).toLocaleString()}{download.error ? ' / not confirmed on disk' : download.pending ? ' / saving' : ''}</Text></> : <Text style={s.body}>No catalog saved. Use Download catalog after a successful live request. The HTML primer and four exercises are already bundled.</Text>}
              <Text style={s.small}>A native installation can open bundled content and saved lessons offline. This browser preview is not an offline-installed app. Removing the app or clearing its data can remove these records.</Text>
              {catalogStatus}
              <Button label="Remove saved catalog" disabled={download.phase === 'loading' || download.pending > 0 || (!saved && download.phase !== 'blocked')} tone="danger" onPress={removeDownload} />
            </View>
            <View style={s.deviceCard}><Label>03 / A CLEAR BOUNDARY</Label><Text style={s.h2}>Practice, not private storage.</Text><Text style={s.body}>Do not put secrets, credentials or proprietary code in exercise drafts. AsyncStorage is not an encrypted vault. The app makes only public catalog reads; it never sends your code or progress to the server.</Text><Button label="Training on the web" tone="light" onPress={() => openWeb(TRAINING_URL)} /><Button label="Privacy and launch terms" tone="light" onPress={() => openWeb(`${PUBLIC_SITE}/#/policies`)} /></View>
          </>}
          <View style={s.pageFooter}><Label>BUILT FOR THE NEXT LINE.</Label><Text style={s.small}>Billion Codes / Native learning desk</Text></View>
        </View>
      </ScrollView>
      <View style={s.tabs} accessibilityRole="tablist">{(['Desk', 'Lessons', 'Practice', 'Device'] as const).map((item, index) => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }} accessibilityLabel={item} onPress={() => setTab(item)} style={({ pressed }) => [s.tab, pressed && s.pressed]}><View style={[s.tabIndicator, tab === item && s.tabIndicatorActive]} /><Text style={[s.tabIndex, tab === item && s.tabTextActive]}>0{index + 1}</Text><Text style={[s.tabText, tab === item && s.tabTextActive]}>{item}</Text></Pressable>)}</View>
    </KeyboardAvoidingView>
    <Modal visible={!!confirmation} transparent animationType="fade" onRequestClose={() => setConfirmation(null)}>
      <View style={s.modalBackdrop}><View style={s.modalCard} accessibilityViewIsModal>
        <Label>PLEASE CONFIRM</Label><Text accessibilityRole="header" style={s.h2}>{confirmation?.title}</Text><Text style={s.body}>{confirmation?.detail}</Text>
        <Button label="Cancel" tone="light" onPress={() => setConfirmation(null)} />
        <Button label="Confirm reset" tone="danger" onPress={() => { const action = confirmation?.action; setConfirmation(null); action?.(); }} />
      </View></View>
    </Modal>
  </SafeAreaView>;
}

export default function App() {
  const [loaded, error] = useFonts({ BricolageGrotesque_600SemiBold, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, IBMPlexMono_400Regular });
  if (!loaded && !error) return <SafeAreaProvider><View style={s.loading}><ActivityIndicator color={color.ink} /><Text>Opening your learning desk...</Text></View></SafeAreaProvider>;
  return <SafeAreaProvider><LearningDesk /></SafeAreaProvider>;
}

const s = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: color.paper }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, backgroundColor: color.paper },
  topBar: { paddingHorizontal: 22, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: color.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  brand: { flexDirection: 'row', gap: 10, alignItems: 'center' }, brandMark: { width: 40, height: 40 }, brandText: { fontFamily: font.display, color: color.ink, fontSize: 22 }, edition: { fontFamily: font.mono, fontSize: 9, color: color.muted, letterSpacing: 1 },
  scroll: { flexGrow: 1 }, content: { width: '100%', maxWidth: 820, alignSelf: 'center', padding: 22, gap: 24 }, wide: { paddingTop: 40 }, stack: { gap: 14 },
  label: { fontFamily: font.mono, fontSize: 10, lineHeight: 16, letterSpacing: 1.1, color: color.muted, flexShrink: 1 }, labelLight: { color: color.lime },
  body: { fontFamily: font.body, color: color.ink, fontSize: 16, lineHeight: 25 }, small: { fontFamily: font.body, color: color.muted, fontSize: 13, lineHeight: 20 },
  h1: { fontFamily: font.display, fontSize: 38, lineHeight: 42, color: color.ink, letterSpacing: -1.3 }, h2: { fontFamily: font.display, fontSize: 27, lineHeight: 32, letterSpacing: -0.6, color: color.ink }, heading: { gap: 16, paddingVertical: 12 },
  button: { backgroundColor: color.ink, borderWidth: 1, borderColor: color.ink, minHeight: 50, paddingHorizontal: 19, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' }, buttonText: { fontFamily: font.bold, fontSize: 14, color: color.paper, textAlign: 'center', lineHeight: 21 }, buttonLight: { backgroundColor: 'transparent', borderColor: color.line }, buttonLime: { backgroundColor: color.lime, borderColor: color.lime }, buttonDanger: { backgroundColor: color.error, borderColor: color.error }, buttonTextDark: { color: color.ink }, pressed: { opacity: 0.7 }, disabled: { opacity: 0.45 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  notice: { padding: 16, backgroundColor: color.soft, borderLeftWidth: 3, borderLeftColor: color.ink }, noticeError: { backgroundColor: '#f9e9df', borderLeftColor: color.error },
  hero: { backgroundColor: color.ink, padding: 24, gap: 23, overflow: 'hidden' }, heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: color.coral }, heroTitle: { fontFamily: font.display, fontSize: 39, lineHeight: 43, letterSpacing: -1.3, color: color.paper }, heroBody: { fontFamily: font.body, color: '#d7e1e4', fontSize: 16, lineHeight: 25, maxWidth: 480 },
  deskDrawing: { borderWidth: 1, borderColor: '#557078', backgroundColor: '#1d3744', padding: 17, gap: 18, transform: [{ rotate: '-1deg' }] }, drawingTop: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10, borderBottomWidth: 1, borderColor: '#46616d' }, drawingLabel: { fontFamily: font.mono, fontSize: 10, color: '#c8d7d4' }, drawingCode: { fontFamily: font.mono, fontSize: 11, lineHeight: 22, color: color.lime },
  stats: { flexDirection: 'row', borderBottomWidth: 1, borderColor: color.line, paddingBottom: 21, gap: 20 }, stat: { flex: 1, gap: 5 }, statValue: { fontFamily: font.display, fontSize: 39, color: color.ink }, statOf: { fontSize: 21, color: color.muted },
  sectionLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }, courseCard: { padding: 24, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, gap: 16 }, primerCard: { backgroundColor: '#eef2df', borderColor: '#d1d9b7' }, cardNumber: { fontFamily: font.mono, fontSize: 12, color: color.muted }, arrow: { fontSize: 26, color: color.ink }, practiceTeaser: { backgroundColor: color.lime, padding: 24, gap: 18 }, training: { borderTopWidth: 1, borderColor: color.line, paddingTop: 27, gap: 16 },
  readerHeader: { paddingTop: 22, borderTopWidth: 2, borderTopColor: color.ink, gap: 13 }, lessonList: { borderWidth: 1, borderColor: color.line }, lessonButton: { minHeight: 62, flexDirection: 'row', padding: 15, gap: 12, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: color.line }, lessonSelected: { backgroundColor: '#edf2d9', borderLeftWidth: 3, borderLeftColor: color.ink }, lessonIndex: { fontFamily: font.mono, color: color.muted, fontSize: 12 }, lessonTitle: { flex: 1, fontFamily: font.medium, fontSize: 15, color: color.ink, lineHeight: 22 }, readLabel: { fontFamily: font.mono, fontSize: 10, color: color.ink }, article: { paddingTop: 20, gap: 23 }, articleTitle: { fontFamily: font.display, fontSize: 32, lineHeight: 38, color: color.ink }, paragraph: { fontFamily: font.body, fontSize: 17, lineHeight: 29, color: color.ink }, lessonCode: { fontFamily: font.mono, fontSize: 12, lineHeight: 23, color: color.lime, backgroundColor: color.ink, padding: 18 }, divider: { height: 1, backgroundColor: color.line },
  challengeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, challengeTab: { width: '47%', flexGrow: 1, backgroundColor: color.soft, padding: 15, gap: 12, minHeight: 106 }, challengeActive: { backgroundColor: color.ink }, challengeNumber: { fontFamily: font.mono, color: color.muted, fontSize: 10 }, challengeName: { fontFamily: font.medium, fontSize: 15, lineHeight: 21, color: color.ink }, onInk: { color: color.paper },
  editorFrame: { backgroundColor: color.ink, borderWidth: 1, borderColor: color.ink }, editorBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', borderBottomWidth: 1, borderColor: '#46616d', padding: 14 }, editorFile: { fontFamily: font.mono, fontSize: 11, color: color.lime }, editorMeta: { fontFamily: font.mono, fontSize: 10, lineHeight: 17, color: '#c9d6dc' }, editor: { minHeight: 290, maxHeight: 520, padding: 17, fontFamily: font.mono, color: color.paper, fontSize: 14, lineHeight: 23, backgroundColor: color.ink }, editorFooter: { padding: 13, borderTopWidth: 1, borderColor: '#46616d' },
  feedback: { padding: 20, backgroundColor: color.white, borderWidth: 1, borderColor: color.line, gap: 20 }, checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' }, checkIcon: { fontFamily: font.mono, fontSize: 10, padding: 5, backgroundColor: color.soft, color: color.muted, minWidth: 33, textAlign: 'center' }, checkPassed: { backgroundColor: color.lime, color: color.ink }, checkText: { flex: 1, fontFamily: font.body, color: color.ink, fontSize: 15, lineHeight: 23 },
  deviceCard: { padding: 22, borderWidth: 1, borderColor: color.line, backgroundColor: color.white, gap: 19 }, pageFooter: { borderTopWidth: 1, borderColor: color.line, paddingTop: 24, paddingBottom: 16, gap: 9 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: color.line, backgroundColor: color.paper, paddingHorizontal: 12 }, tab: { flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 3, paddingBottom: 7 }, tabIndicator: { position: 'absolute', top: 0, width: 28, height: 3, backgroundColor: 'transparent' }, tabIndicatorActive: { backgroundColor: color.ink }, tabIndex: { fontFamily: font.mono, fontSize: 9, color: color.muted }, tabText: { fontFamily: font.medium, fontSize: 12, color: color.muted }, tabTextActive: { color: color.ink },
  modalBackdrop: { flex: 1, backgroundColor: '#152b3acc', padding: 26, alignItems: 'center', justifyContent: 'center' }, modalCard: { width: '100%', maxWidth: 450, padding: 26, backgroundColor: color.paper, gap: 22 },
});
