import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';

export interface DetailRow {
  label: string;
  text: string;
}

/** Reads an alert's `metadata.detail_rows` (defensively — it comes from the server). */
export function detailRowsOf(metadata: Record<string, unknown> | undefined): DetailRow[] {
  const rows = metadata?.detail_rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r: any) => r && typeof r.label === 'string')
    .map((r: any) => ({ label: r.label, text: typeof r.text === 'string' ? r.text : '' }));
}

/**
 * Alert detail as a short bullet list — one bullet per row, the label in bold and its
 * text underneath — instead of running prose. Used for per-port signals, per-day winds
 * and per-district swell.
 */
export function AlertDetailRows({ rows, title }: { rows: DetailRow[]; title?: string }) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.box}>
      {!!title && <Text style={styles.title}>{title}</Text>}
      {rows.map((row, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.bullet} />
          <View style={styles.rowBody}>
            <Text style={styles.label}>{row.label}</Text>
            {!!row.text && <Text style={styles.text}>{row.text}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    gap: 8,
  },
  title: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
  rowBody: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
    lineHeight: 17,
  },
  text: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    lineHeight: 17,
    marginTop: 1,
  },
});
