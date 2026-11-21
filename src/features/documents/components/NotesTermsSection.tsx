import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { Field } from '@/components/Field';
import { FormCard, SectionHeader } from '@/components/FormParts';
import { PickerField } from '@/components/PickerField';
import { listTextTemplates, type TextTemplate } from '../api';

const templateTitle = (t: TextTemplate) => `${t.title || t.name || 'Untitled'}${t.isDefault ? ' (Default)' : ''}`;

/**
 * Notes & terms of a document form: a saved note and saved terms to start from (the company's, for this kind of
 * document), and the text itself, which can always be changed. `onChange` takes the changed text only.
 */
export function NotesTermsSection({ documentType, notes, terms, notesPlaceholder, termsPlaceholder, onChange }: {
  documentType: string; notes: string; terms: string; notesPlaceholder: string; termsPlaceholder: string;
  onChange: (patch: { notes?: string; terms?: string }) => void;
}) {
  const [noteTemplateId, setNoteTemplateId] = useState('');
  const [termTemplateId, setTermTemplateId] = useState('');
  const savedNotes = useQuery({ queryKey: ['templates', 'notes', documentType], queryFn: () => listTextTemplates('notes', documentType) });
  const savedTerms = useQuery({ queryKey: ['templates', 'terms', documentType], queryFn: () => listTextTemplates('terms', documentType) });
  return (
    <View>
      <SectionHeader>Notes & terms</SectionHeader>
      <FormCard>
        <PickerField
          label="Saved note"
          value={noteTemplateId}
          placeholder={savedNotes.data?.length === 0 ? 'No saved notes yet' : 'Pick a saved note…'}
          options={(savedNotes.data ?? []).map((t) => ({ value: t.id, label: templateTitle(t) }))}
          onChange={(id) => {
            setNoteTemplateId(id);
            onChange({ notes: savedNotes.data?.find((t) => t.id === id)?.content ?? '' });
          }}
        />
        <Field label="Notes" value={notes} onChangeText={(n) => onChange({ notes: n })} placeholder={notesPlaceholder} multiline maxLength={2000} autoCapitalize="sentences" />
        <PickerField
          label="Saved terms"
          value={termTemplateId}
          placeholder={savedTerms.data?.length === 0 ? 'No saved terms yet' : 'Pick saved terms…'}
          options={(savedTerms.data ?? []).map((t) => ({ value: t.id, label: templateTitle(t) }))}
          onChange={(id) => {
            setTermTemplateId(id);
            const found = savedTerms.data?.find((t) => t.id === id);
            onChange({ terms: found?.termsAndConditions || found?.content || '' });
          }}
        />
        <Field label="Terms & Conditions" value={terms} onChangeText={(t) => onChange({ terms: t })} placeholder={termsPlaceholder} multiline maxLength={4000} autoCapitalize="sentences" />
      </FormCard>
    </View>
  );
}
