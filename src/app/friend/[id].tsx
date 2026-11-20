import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInputInstance } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Field, Group, Row, Toggle } from '@/components/form';
import { Screen, TopBar } from '@/components/layout';
import { Overlays } from '@/components/overlays';
import { T } from '@/components/text';
import { balances, standing } from '@/lib/balances';
import { haptic } from '@/lib/haptics';
import { LIMITS } from '@/lib/limits';
import { confirm, goBack } from '@/lib/system';
import { firstName } from '@/lib/text';
import type { Person } from '@/lib/types';
import { isPhone, isVpa } from '@/lib/upi';
import { deleteFriend } from '@/stores/actions';
import { useLedger } from '@/stores/ledger';
import { toast } from '@/stores/toast';
import { space, useCurrency, useMoney, useTheme } from '@/theme';

/** Room for the save button between a focused field and the keyboard. */
const DOCK_TYPING = 96;
/** Raw phone input may carry spaces and dashes; it's normalised on save. */
const PHONE_INPUT = LIMITS.phone + 8;

type Params = { id: string; name?: string };

export default function FriendScreen() {
  const params = useLocalSearchParams<Params>();
  const isNew = params.id === 'new';
  const found = useLedger((s) => (isNew ? undefined : s.people.find((p) => p.id === params.id)));
  const live = found?.deletedAt === null ? found : undefined;
  // After a delete the modal is still sliding away; keep showing what was there.
  const [last, setLast] = useState(live);
  const [leaving, setLeaving] = useState(false);
  if (live && live !== last) setLast(live);
  const person = live ?? (leaving ? last : undefined);

  let body: React.ReactNode;
  if (isNew) body = <Editor preset={typeof params.name === 'string' ? params.name : ''} />;
  else if (!person) body = <Missing />;
  else body = <Editor key={person.id} person={person} onLeave={() => setLeaving(true)} />;

  return (
    <Screen>
      {body}
      <Overlays />
    </Screen>
  );
}

function Missing() {
  return (
    <>
      <TopBar modal />
      <EmptyState
        icon="users"
        title="This friend isn’t here"
        body="They may have been deleted. Anything removed in the last 30 days is in Trash."
        action={{ label: 'Close', onPress: goBack }}
      />
    </>
  );
}

function Editor({ person, preset = '', onLeave }: { person?: Person; preset?: string; onLeave?: () => void }) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const money = useMoney();
  const currency = useCurrency();
  const people = useLedger((s) => s.people);
  const entries = useLedger((s) => s.entries);

  const [name, setName] = useState(person?.name ?? preset.slice(0, LIMITS.name));
  const [phone, setPhone] = useState(person?.phone ?? '');
  const [upi, setUpi] = useState(person?.upi ?? '');
  const [note, setNote] = useState(person?.note ?? '');
  const [archived, setArchived] = useState(person?.archived ?? false);
  // Mistakes show once a field is left (or Save is tapped), not while someone is still typing.
  const [checked, setChecked] = useState({ phone: false, upi: false });
  const phoneRef = useRef<TextInputInstance>(null);
  const upiRef = useRef<TextInputInstance>(null);
  const noteRef = useRef<TextInputInstance>(null);

  const editing = person !== undefined;
  const typed = name.replace(/\s+/g, ' ').trim();
  const first = typed ? firstName(typed) : 'them';
  const phoneBad = phone.trim() !== '' && !isPhone(phone);
  const upiBad = upi.trim() !== '' && !isVpa(upi);
  const twin = typed
    ? people.find(
        (p) => p.deletedAt === null && p.id !== person?.id && p.name.toLocaleLowerCase() === typed.toLocaleLowerCase(),
      )
    : undefined;
  const balance = person ? (balances(entries).get(person.id) ?? 0) : 0;
  const history = person ? entries.some((e) => e.personId === person.id && e.deletedAt === null) : false;
  const showUpi = currency === 'INR' || upi.trim() !== '';

  const save = () => {
    if (!typed) return;
    if (phoneBad || upiBad) {
      setChecked({ phone: true, upi: true });
      haptic('error');
      return;
    }
    const store = useLedger.getState();
    if (person) {
      store.updatePerson(person.id, { name: typed, phone, upi, note, archived });
      haptic('success');
      toast({ message: archived && !person.archived ? `${firstName(typed)} archived` : 'Saved', icon: 'check', tone: 'success' });
      goBack();
      return;
    }
    const added = store.addPerson({ name: typed, phone, upi, note });
    if (!added) {
      toast({ message: 'That didn’t save. Please try again.', icon: 'warning', tone: 'danger' });
      return;
    }
    haptic('success');
    toast({ message: `${firstName(added.name)} added to your friends`, icon: 'user-plus', tone: 'success' });
    router.back();
    router.push({ pathname: '/person/[id]', params: { id: added.id } });
  };

  const remove = async () => {
    if (!person) return;
    if (history) {
      const ok = await confirm({
        title: `Delete ${firstName(person.name)}?`,
        message:
          balance !== 0
            ? `${standing(firstName(person.name), balance, money)}. Their history moves to Trash for 30 days.`
            : 'Their history moves to Trash for 30 days.',
        confirm: 'Delete',
        destructive: true,
      });
      if (!ok) return;
    }
    onLeave?.();
    deleteFriend(person.id);
    router.dismissAll();
  };

  let archiveDetail = 'Hides them from your friends list. Their history stays.';
  if (archived && balance !== 0) archiveDetail = `Still counts in your totals: ${standing(firstName(typed || person?.name || ''), balance, money, false)}.`;

  return (
    <>
      <TopBar modal title={editing ? 'Edit friend' : 'New friend'} />
      <KeyboardAwareScrollView
        bottomOffset={DOCK_TYPING}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.flex}
        contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Avatar name={typed || '?'} size={72} />
          <T variant="title" color={typed ? 'ink' : 'ink3'} align="center" numberOfLines={2}>
            {typed || 'Who’s this?'}
          </T>
        </View>

        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Their name"
          autoFocus={!editing}
          autoCapitalize="words"
          autoCorrect={false}
          autoComplete="name"
          textContentType="name"
          maxLength={LIMITS.name}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => phoneRef.current?.focus()}
          hint={twin ? `You already have a friend called ${twin.name}. A surname helps tell them apart.` : undefined}
          testID="friend-name"
        />
        <Field
          ref={phoneRef}
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="+91 98765 43210"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={PHONE_INPUT}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => (showUpi ? upiRef : noteRef).current?.focus()}
          onBlur={() => setChecked((s) => ({ ...s, phone: true }))}
          error={checked.phone && phoneBad ? 'That doesn’t look like a phone number' : null}
          hint={`Optional · for WhatsApp reminders to ${first}`}
          testID="friend-phone"
        />
        {showUpi ? (
          <Field
            ref={upiRef}
            label="UPI ID"
            value={upi}
            onChangeText={setUpi}
            placeholder="name@bank"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            keyboardType="email-address"
            maxLength={LIMITS.upi}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => noteRef.current?.focus()}
            onBlur={() => setChecked((s) => ({ ...s, upi: true }))}
            error={checked.upi && upiBad ? 'A UPI ID looks like name@bank' : null}
            hint="Optional · lets you pay them back in one tap"
            testID="friend-upi"
          />
        ) : null}
        <Field
          ref={noteRef}
          label="Note"
          value={note}
          onChangeText={setNote}
          placeholder="Flatmate, college friend…"
          maxLength={LIMITS.note}
          returnKeyType="done"
          testID="friend-note"
        />

        {editing ? (
          <Group>
            <Row
              label="Archive"
              icon="archive"
              detail={archiveDetail}
              right={<Toggle value={archived} onChange={setArchived} label="Archive friend" testID="friend-archive" />}
            />
            <Row label="Delete friend" icon="trash" danger onPress={() => void remove()} testID="friend-delete" />
          </Group>
        ) : null}
      </KeyboardAwareScrollView>

      <KeyboardStickyView
        offset={{ closed: 0, opened: insets.bottom }}
        style={[styles.dock, { backgroundColor: c.bg, paddingBottom: insets.bottom + space.md }]}>
        <Button
          label={editing ? 'Save' : 'Add friend'}
          variant="ink"
          size="lg"
          full
          disabled={!typed}
          onPress={save}
          testID="friend-save"
        />
      </KeyboardStickyView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingHorizontal: space.page, paddingTop: space.sm, paddingBottom: space.xl, gap: space.lg },
  header: { alignItems: 'center', gap: space.md, paddingVertical: space.md },
  dock: { paddingHorizontal: space.page, paddingTop: space.md },
});
