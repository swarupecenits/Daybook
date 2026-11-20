import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Fragment, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import {
  AppState,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextStyle,
} from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { webInput } from '@/components/form';
import { Icon, type IconName } from '@/components/icon';
import { Screen, TopBar } from '@/components/layout';
import { AFTER_SHEET_MS, NoteSheet } from '@/components/note-sheet';
import { Press } from '@/components/press';
import { T } from '@/components/text';
import { formatDayLong, formatTime, relativeTime, toKey } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { LIMITS } from '@/lib/limits';
import { isBlank } from '@/lib/notes';
import { goBack, openExternal } from '@/lib/system';
import {
  checklistStats,
  continueList,
  type Edit,
  formatAt,
  inlineTokens,
  insertAt,
  type Line,
  type LineFormat,
  parseLine,
  type Selection,
  toggleChecklist,
  toggleLineFormat,
  wordCount,
} from '@/lib/text';
import type { Note } from '@/lib/types';
import { toggleNotePin } from '@/stores/actions';
import { useClock } from '@/stores/clock';
import { useNotes } from '@/stores/notes';
import { fonts, radius, space, typo, useTheme } from '@/theme';

const WEB = Platform.OS === 'web';
const TOOLBAR = 48;
const MIN_BODY = 280;

const FORMATS: readonly { format: LineFormat; icon: IconName; label: string }[] = [
  { format: 'todo', icon: 'check-square', label: 'Checklist' },
  { format: 'bullet', icon: 'list-bullets', label: 'Bulleted list' },
  { format: 'heading', icon: 'text-h', label: 'Heading' },
  { format: 'quote', icon: 'quotes', label: 'Quote' },
];

const findNote = (id: string) => useNotes.getState().notes.find((n) => n.id === id);

/** Writes the editor's text through to the store, unless the note has gone or nothing changed. */
function writeNote(id: string, title: string, body: string) {
  const current = findNote(id);
  if (!current || current.deletedAt !== null) return;
  if (current.title === title && current.body === body) return;
  useNotes.getState().update(id, { title, body });
}

type WebField = { focus(): void; setSelectionRange(start: number, end: number): void };

function placeCaret(input: TextInputInstance | null, at: Selection) {
  if (!input) return;
  if (WEB) {
    const field = input as unknown as WebField;
    field.focus();
    field.setSelectionRange(at.start, at.end);
    return;
  }
  input.setSelection(at.start, at.end);
}

/** Each line with the offset just past its last character, where a tap puts the caret. */
function rowsOf(body: string): { line: Line; end: number }[] {
  let offset = 0;
  return body.split('\n').map((raw, index) => {
    const end = offset + raw.length;
    offset = end + 1;
    return { line: parseLine(raw, index), end };
  });
}

export default function NoteScreen() {
  const c = useTheme();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const found = useNotes((s) => s.notes.find((n) => n.id === id));
  const live = found?.deletedAt === null ? found : undefined;
  // While the screen slides away after a delete, keep showing the page that was there.
  const [last, setLast] = useState(live);
  const [leaving, setLeaving] = useState(false);
  if (live && live !== last) setLast(live);
  const note = live ?? (leaving ? last : undefined);

  return (
    <Screen bg={note ? c.paper[note.color] : undefined}>
      {note ? (
        <Editor key={note.id} note={note} fresh={fresh === '1'} onLeave={() => setLeaving(true)} />
      ) : (
        <Missing />
      )}
    </Screen>
  );
}

function Missing() {
  return (
    <>
      <TopBar />
      <EmptyState
        icon="tray"
        title="This note isn’t here"
        body="It may have been deleted. Anything removed in the last 30 days is in Trash."
        action={{ label: 'Go back', onPress: goBack }}
      />
    </>
  );
}

function Editor({ note, fresh, onLeave }: { note: Note; fresh: boolean; onLeave: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const at = useClock((s) => s.at);
  const now = useClock((s) => s.now);
  const today = useClock((s) => s.today);
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [editing, setEditing] = useState(fresh || isBlank(note));
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState<LineFormat | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [webHeight, setWebHeight] = useState(MIN_BODY);
  const bodyRef = useRef<TextInputInstance>(null);
  // Native events can outrun renders, so handlers read the newest text and caret from refs.
  const latest = useRef(note.body);
  const sel = useRef<Selection>({ start: note.body.length, end: note.body.length });
  const caretTo = useRef<Selection | null>(null);

  const id = note.id;
  const paper = c.paper[note.color];
  const edge = c.paperEdge[note.color];
  const tools = editing && (WEB || focused);

  // Typing is saved once it pauses, when the screen loses focus or the app is put away, and on the way out.
  const save = useEffectEvent(() => writeNote(id, title, body));
  useEffect(() => {
    const timer = setTimeout(() => save(), 500);
    return () => clearTimeout(timer);
  }, [title, body]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') save();
    });
    const off = navigation.addListener('blur', () => save());
    return () => {
      sub.remove();
      off();
    };
  }, [navigation]);
  const leave = useEffectEvent(() => {
    writeNote(id, title, body);
    const current = findNote(id);
    if (current && current.deletedAt === null && isBlank(current)) useNotes.getState().destroy(id);
  });
  useEffect(() => () => leave(), []);

  // Leaves once the options sheet has slid away; cancelled if the screen goes first.
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(goBack, AFTER_SHEET_MS);
    return () => clearTimeout(timer);
  }, [exiting]);

  // A programmatic edit replaces the text; put the caret where the edit says, after the text lands.
  useLayoutEffect(() => {
    const next = caretTo.current;
    if (!next || !editing) return;
    caretTo.current = null;
    placeCaret(bodyRef.current, next);
  }, [body, editing]);

  const setText = (next: string) => {
    latest.current = next;
    setBody(next);
  };

  const currentSel = (): Selection => {
    if (WEB) {
      const field = bodyRef.current as unknown as { selectionStart?: unknown; selectionEnd?: unknown } | null;
      if (field && typeof field.selectionStart === 'number' && typeof field.selectionEnd === 'number') {
        return { start: field.selectionStart, end: field.selectionEnd };
      }
    }
    return sel.current;
  };

  const onBody = (next: string) => {
    const edit = continueList(latest.current, next);
    if (edit) {
      caretTo.current = edit.selection;
      sel.current = edit.selection;
      setText(edit.text);
      return;
    }
    setText(next);
  };

  const onSelect = (next: Selection) => {
    sel.current = next;
    setActive(formatAt(latest.current, next.start));
  };

  const apply = (edit: Edit) => {
    haptic('select');
    sel.current = edit.selection;
    setActive(formatAt(edit.text, edit.selection.start));
    if (edit.text === latest.current) {
      placeCaret(bodyRef.current, edit.selection);
      return;
    }
    caretTo.current = edit.selection;
    setText(edit.text);
  };

  const format = (f: LineFormat) => apply(toggleLineFormat(latest.current, currentSel(), f));

  const insert = (text: string) => {
    const s = currentSel();
    const before = latest.current.slice(0, s.start);
    apply(insertAt(latest.current, s, before && !/\s$/.test(before) ? ` ${text}` : text));
  };

  const editAt = (offset: number) => {
    const target = { start: offset, end: offset };
    sel.current = target;
    caretTo.current = target;
    setActive(formatAt(latest.current, offset));
    setEditing(true);
  };

  const toBody = () => {
    if (!editing) {
      editAt(0);
      return;
    }
    sel.current = { start: 0, end: 0 };
    bodyRef.current?.focus();
    placeCaret(bodyRef.current, sel.current);
  };

  const finish = () => {
    Keyboard.dismiss();
    writeNote(id, title, latest.current);
    setFocused(false);
    setEditing(false);
  };

  const toggle = (index: number) => {
    const next = toggleChecklist(latest.current, index);
    if (next === latest.current) return;
    const { done, total } = checklistStats(next);
    const checked = parseLine(next.split('\n')[index] ?? '', index).kind === 'done';
    haptic(checked && total > 1 && done === total ? 'success' : 'select');
    setText(next);
    writeNote(id, title, next);
  };

  const openSheet = () => {
    Keyboard.dismiss();
    writeNote(id, title, latest.current);
    setSheetOpen(true);
  };

  const back = () => {
    writeNote(id, title, latest.current);
    goBack();
  };

  const words = wordCount(`${title} ${body}`);
  const { done, total } = checklistStats(body);
  const footer = [
    `${words} ${words === 1 ? 'word' : 'words'}`,
    total ? `${done} of ${total} done` : null,
    `edited ${relativeTime(note.updatedAt, at)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <TopBar
        bg={paper}
        onBack={back}
        right={
          <>
            <IconButton
              icon="push-pin"
              weight={note.pinned ? 'fill' : 'regular'}
              color={note.pinned ? c.accent : undefined}
              label={note.pinned ? 'Unpin' : 'Pin to top'}
              haptic={false}
              onPress={() => toggleNotePin(id)}
              testID="note-pin-toggle"
            />
            {editing ? (
              <Button label="Done" size="sm" variant="ink" onPress={finish} style={styles.done} testID="note-done" />
            ) : (
              <IconButton
                icon="pencil-simple"
                label="Edit"
                onPress={() => editAt(latest.current.length)}
                testID="note-edit"
              />
            )}
            <IconButton icon="dots-three" weight="bold" label="More options" onPress={openSheet} testID="note-more" />
          </>
        }
      />
      <KeyboardAwareScrollView
        bottomOffset={TOOLBAR + 20}
        extraKeyboardSpace={tools && !WEB ? TOOLBAR : 0}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + space.xxl + (WEB && editing ? TOOLBAR : 0) },
        ]}>
        <View style={styles.page}>
          <T variant="label" color="ink3" numberOfLines={1}>
            {formatDayLong(toKey(new Date(note.createdAt)))}
            {note.archived ? ' · archived' : ''}
          </T>
          <TextInput
            value={title}
            onChangeText={(v) => setTitle(v.replace(/[\r\n]+/g, ' '))}
            onSubmitEditing={toBody}
            multiline
            scrollEnabled={false}
            submitBehavior="submit"
            returnKeyType="next"
            placeholder="Title"
            placeholderTextColor={c.ink3}
            selectionColor={c.accent}
            cursorColor={c.accent}
            keyboardAppearance={c.scheme}
            maxLength={LIMITS.title}
            maxFontSizeMultiplier={1.3}
            accessibilityLabel="Note title"
            testID="note-title"
            style={[typo.title, styles.title, { color: c.ink }, webInput]}
          />
          {editing ? (
            <TextInput
              ref={bodyRef}
              value={body}
              onChangeText={onBody}
              onSelectionChange={(e) => onSelect(e.nativeEvent.selection)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onContentSizeChange={
                WEB ? (e) => setWebHeight(Math.max(MIN_BODY, Math.ceil(e.nativeEvent.contentSize.height))) : undefined
              }
              autoFocus
              multiline
              scrollEnabled={false}
              textAlignVertical="top"
              placeholder="Start writing…"
              placeholderTextColor={c.ink3}
              selectionColor={c.accent}
              cursorColor={c.accent}
              keyboardAppearance={c.scheme}
              maxLength={LIMITS.body}
              maxFontSizeMultiplier={1.4}
              accessibilityLabel="Note text"
              testID="note-body"
              style={[styles.text, styles.input, { color: c.ink }, WEB && { height: webHeight }, webInput]}
            />
          ) : (
            <Reader body={body} onEdit={editAt} onToggle={toggle} />
          )}
          {words ? (
            <T variant="label" color="ink3" style={styles.footer}>
              {footer}
            </T>
          ) : null}
        </View>
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }} style={styles.dock} pointerEvents="box-none">
        {tools ? (
          <Animated.View
            entering={FadeIn.duration(140)}
            exiting={FadeOut.duration(100)}
            style={[styles.toolbar, { backgroundColor: paper, borderTopColor: edge, paddingBottom: insets.bottom }]}>
            <ScrollView
              horizontal
              keyboardShouldPersistTaps="always"
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tools}>
              {FORMATS.map((f) => (
                <Tool
                  key={f.format}
                  icon={f.icon}
                  label={f.label}
                  active={active === f.format}
                  onPress={() => format(f.format)}
                />
              ))}
              <View style={[styles.divider, { backgroundColor: edge }]} />
              <Tool icon="hash" label="Add a tag" onPress={() => insert('#')} />
              <Tool icon="clock" label="Insert the time" onPress={() => insert(`${formatTime(now)} — `)} />
              <Tool icon="calendar-blank" label="Insert today’s date" onPress={() => insert(formatDayLong(today))} />
            </ScrollView>
            {!WEB ? (
              <>
                <View style={[styles.divider, { backgroundColor: edge }]} />
                <Tool icon="keyboard" label="Hide keyboard" onPress={() => Keyboard.dismiss()} />
              </>
            ) : null}
          </Animated.View>
        ) : null}
      </KeyboardStickyView>

      <NoteSheet
        note={note}
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onGone={() => {
          onLeave();
          setExiting(true);
        }}
      />
    </>
  );
}

function Tool({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  const c = useTheme();
  return (
    <Press
      onPress={onPress}
      scale={0.86}
      accessibilityLabel={label}
      aria-selected={active}
      style={[styles.tool, active && { backgroundColor: c.accentSoft }]}
      testID={`tool-${icon}`}>
      <Icon name={icon} size={21} color={active ? c.accent : c.ink2} weight={active ? 'bold' : 'regular'} />
    </Press>
  );
}

/** The note as a page: checkboxes tick, links open, tags search, and a tap anywhere starts editing there. */
function Reader({
  body,
  onEdit,
  onToggle,
}: {
  body: string;
  onEdit: (offset: number) => void;
  onToggle: (index: number) => void;
}) {
  const c = useTheme();
  if (!body.trim()) {
    return (
      <Pressable
        onPress={() => onEdit(body.length)}
        accessibilityRole="button"
        accessibilityLabel="Start writing"
        style={styles.empty}
        testID="note-start">
        <Text style={[styles.text, { color: c.ink3 }]} maxFontSizeMultiplier={1.4}>
          Tap to start writing…
        </Text>
      </Pressable>
    );
  }
  return (
    <View testID="note-reader">
      {rowsOf(body).map(({ line, end }) => (
        <ReadLine key={line.index} line={line} onEdit={() => onEdit(end)} onToggle={() => onToggle(line.index)} />
      ))}
      <Pressable
        onPress={() => onEdit(body.length)}
        accessibilityRole="button"
        accessibilityLabel="Keep writing"
        style={styles.tail}
      />
    </View>
  );
}

function ReadLine({ line, onEdit, onToggle }: { line: Line; onEdit: () => void; onToggle: () => void }) {
  const c = useTheme();
  if (line.kind === 'blank') return <Pressable onPress={onEdit} accessible={false} style={styles.blank} />;

  if (line.kind === 'todo' || line.kind === 'done') {
    const done = line.kind === 'done';
    return (
      <View style={styles.row}>
        <Press
          onPress={onToggle}
          scale={0.82}
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityLabel={line.text || 'Checklist item'}
          aria-checked={done}
          style={[
            styles.box,
            { borderColor: done ? c.ink2 : c.ink3, backgroundColor: done ? c.ink2 : 'transparent' },
          ]}
          testID={`note-check-${line.index}`}>
          {done ? <Icon name="check" size={13} color={c.surface} weight="bold" /> : null}
        </Press>
        <Pressable onPress={onEdit} style={styles.flex}>
          <Rich
            text={line.text}
            style={[styles.text, { color: done ? c.ink3 : c.ink }, done && styles.strike]}
          />
        </Pressable>
      </View>
    );
  }

  if (line.kind === 'bullet') {
    return (
      <Pressable onPress={onEdit} style={styles.row}>
        <View style={styles.gutter}>
          <View style={[styles.dot, { backgroundColor: c.ink2 }]} />
        </View>
        <Rich text={line.text} style={[styles.text, styles.flex, { color: c.ink }]} />
      </Pressable>
    );
  }

  if (line.kind === 'quote') {
    return (
      <Pressable onPress={onEdit} style={styles.row}>
        <View style={[styles.bar, { backgroundColor: c.accent }]} />
        <Rich text={line.text} style={[styles.quote, styles.flex, { color: c.ink2 }]} />
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onEdit} style={line.kind === 'heading' && line.index > 0 ? styles.headingGap : undefined}>
      <Rich text={line.text} style={[line.kind === 'heading' ? styles.heading : styles.text, { color: c.ink }]} />
    </Pressable>
  );
}

function Rich({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const c = useTheme();
  return (
    <Text style={style} maxFontSizeMultiplier={1.4}>
      {inlineTokens(text).map((token, i) => {
        if (token.kind === 'text') return <Fragment key={i}>{token.text}</Fragment>;
        const link = token.kind === 'link';
        return (
          <Text
            key={i}
            accessibilityRole="link"
            onPress={() =>
              link
                ? void openExternal(token.text)
                : router.push({ pathname: '/search', params: { q: token.text } })
            }
            style={[{ color: c.accent }, link && styles.underline]}>
            {token.text}
          </Text>
        );
      })}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: space.page, paddingTop: space.xs },
  page: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  done: { marginHorizontal: 4 },
  title: { paddingTop: space.sm, paddingBottom: space.md, paddingHorizontal: 0 },
  text: { fontFamily: fonts.sans, fontSize: 17, lineHeight: 26 },
  input: { minHeight: MIN_BODY, padding: 0, paddingTop: 0 },
  heading: { fontFamily: fonts.serif, fontSize: 22, lineHeight: 29, letterSpacing: -0.2 },
  headingGap: { marginTop: space.sm },
  quote: { fontFamily: fonts.serifItalic, fontSize: 18, lineHeight: 26 },
  strike: { textDecorationLine: 'line-through' },
  underline: { textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  box: {
    width: 20,
    height: 20,
    marginTop: 3,
    marginRight: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gutter: { width: 22, height: 26, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: 2, marginLeft: 4, marginRight: 6 },
  blank: { height: 12 },
  tail: { minHeight: 160 },
  empty: { minHeight: MIN_BODY },
  footer: { marginTop: space.xl },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  toolbar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth },
  tools: { height: TOOLBAR, alignItems: 'center', paddingHorizontal: 6, gap: 2 },
  tool: { width: 44, height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  divider: { width: StyleSheet.hairlineWidth, height: 24, marginHorizontal: 4 },
});
