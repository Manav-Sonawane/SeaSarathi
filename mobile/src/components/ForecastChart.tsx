import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Line, Polyline, Polygon, Text as SvgText } from 'react-native-svg';
import { useShallow } from 'zustand/react/shallow';
import { colors } from '../theme/colors';
import { forecastAPI, ForecastTimeline } from '../services/api';
import { useUserStore } from '../store/userStore';
import { useNetworkStore } from '../store/networkStore';
import { getScreenText } from '../constants/screenTranslations';
import { fillText } from '../utils/formatText';

const CHART_HEIGHT = 70;
const AXIS_HEIGHT = 14;
const REFRESH_MS = 30 * 60 * 1000;

// Hour of day in India (IST = UTC+5:30) — fishermen read the chart in local time.
function istHour(iso: string): number {
  const d = new Date(iso);
  return Math.floor(((d.getUTCHours() * 60 + d.getUTCMinutes() + 330) % 1440) / 60);
}

interface BarChartProps {
  width: number;
  values: (number | null)[];
  hours: number[];
  scaleMax: number;
  colorFor: (v: number) => string;
  lines?: { at: number; color: string }[];
  overlay?: (number | null)[]; // drawn as a line over the bars (gusts)
}

// One row of hourly bars with optional threshold lines and an x axis labelled every 6 hours.
function BarChart({ width, values, hours, scaleMax, colorFor, lines = [], overlay }: BarChartProps) {
  const n = values.length;
  const slot = width / n;
  const y = (v: number) => CHART_HEIGHT - (Math.min(v, scaleMax) / scaleMax) * CHART_HEIGHT;
  const overlayPoints = overlay
    ? overlay.map((v, i) => (v == null ? null : `${i * slot + slot / 2},${y(v)}`)).filter(Boolean).join(' ')
    : '';
  return (
    <Svg width={width} height={CHART_HEIGHT + AXIS_HEIGHT}>
      {values.map((v, i) =>
        v == null ? null : (
          <Rect key={i} x={i * slot + 0.5} y={y(v)} width={Math.max(slot - 1, 1)} height={CHART_HEIGHT - y(v)} fill={colorFor(v)} rx={1} />
        )
      )}
      {lines.map((l) => (
        <Line key={l.at} x1={0} x2={width} y1={y(l.at)} y2={y(l.at)} stroke={l.color} strokeWidth={1} strokeDasharray="4,3" />
      ))}
      {overlayPoints ? <Polyline points={overlayPoints} fill="none" stroke={colors.onSurfaceVariant} strokeWidth={1.2} /> : null}
      <Line x1={0} x2={width} y1={CHART_HEIGHT} y2={CHART_HEIGHT} stroke={colors.outlineVariant} strokeWidth={1} />
      {hours.map((h, i) =>
        h % 6 === 0 ? (
          <SvgText key={`x${i}`} x={i * slot + slot / 2} y={CHART_HEIGHT + 11} fontSize={9} fill={colors.onSurfaceVariant} textAnchor="middle">
            {String(h).padStart(2, '0')}
          </SvgText>
        ) : null
      )}
    </Svg>
  );
}

// Tide: a filled curve around the zero (mean-sea-level) line.
function TideChart({ width, values, hours }: { width: number; values: (number | null)[]; hours: number[] }) {
  const n = values.length;
  const slot = width / n;
  const nums = values.filter((v): v is number => v != null);
  const span = Math.max(0.5, ...nums.map((v) => Math.abs(v)));
  const zero = CHART_HEIGHT / 2;
  const y = (v: number) => zero - (v / span) * (CHART_HEIGHT / 2 - 2);
  const pts = values.map((v, i) => (v == null ? null : [i * slot + slot / 2, y(v)] as const)).filter((p): p is readonly [number, number] => !!p);
  const line = pts.map((p) => `${p[0]},${p[1]}`).join(' ');
  const area = pts.length ? `${pts[0][0]},${zero} ${line} ${pts[pts.length - 1][0]},${zero}` : '';
  return (
    <Svg width={width} height={CHART_HEIGHT + AXIS_HEIGHT}>
      {area ? <Polygon points={area} fill={colors.primaryContainer} opacity={0.25} /> : null}
      <Line x1={0} x2={width} y1={zero} y2={zero} stroke={colors.outlineVariant} strokeWidth={1} strokeDasharray="4,3" />
      {line ? <Polyline points={line} fill="none" stroke={colors.primary} strokeWidth={1.8} /> : null}
      {hours.map((h, i) =>
        h % 6 === 0 ? (
          <SvgText key={`x${i}`} x={i * slot + slot / 2} y={CHART_HEIGHT + 11} fontSize={9} fill={colors.onSurfaceVariant} textAnchor="middle">
            {String(h).padStart(2, '0')}
          </SvgText>
        ) : null
      )}
    </Svg>
  );
}

/**
 * 48-hour forecast chart for the fisherman's location: wind (with gusts), waves and
 * tide, from the same Open-Meteo hourly data the chat uses. Bars turn amber / red at
 * the same cut-offs as the safety alerts. Renders nothing while offline or if the
 * forecast can't be loaded — the Dashboard already explains offline/unavailable data.
 */
export function ForecastChart() {
  const { portInfo, getLanguageInfo } = useUserStore(
    useShallow((s) => ({ portInfo: s.portInfo, getLanguageInfo: s.getLanguageInfo }))
  );
  const t = getScreenText(getLanguageInfo().code);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [data, setData] = useState<ForecastTimeline | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    const load = () =>
      forecastAPI
        .getTimeline(portInfo.latitude, portInfo.longitude)
        .then((d) => !cancelled && setData(d))
        .catch((err) => console.error('[ForecastChart] /forecast/timeline failed:', err));
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [portInfo.latitude, portInfo.longitude, isOnline]);

  if (!isOnline || !data || data.points.length < 3) return null;

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width));
  const pts = data.points;
  const hours = pts.map((p) => istHour(p.t));
  const th = data.thresholds;
  const max = (vals: (number | null)[]) => Math.max(...vals.filter((v): v is number => v != null), 0);
  const wind = pts.map((p) => p.wind_kmh);
  const waves = pts.map((p) => p.wave_m);
  const tide = pts.map((p) => p.tide_m);
  const sev = (v: number, high: number, moderate: number) => (v > high ? colors.error : v > moderate ? colors.riskModerate : colors.primaryContainer);

  const Title = ({ label, peak, unit }: { label: string; peak: number; unit?: string }) => (
    <View style={styles.rowHead}>
      <Text style={styles.rowTitle}>{label}</Text>
      <Text style={styles.rowMax}>{fillText(t.dashboard.forecastMax, { n: `${Math.round(peak * 10) / 10}${unit ?? ''}` })}</Text>
    </View>
  );

  return (
    <View style={styles.card} onLayout={onLayout}>
      <Text style={styles.title}>{t.dashboard.forecastTitle}</Text>
      {width > 0 && (
        <>
          <Title label={t.dashboard.forecastWind} peak={max(wind)} />
          <BarChart
            width={width}
            values={wind}
            hours={hours}
            scaleMax={Math.max(max(pts.map((p) => p.gust_kmh)), th.wind_high_kmh)}
            colorFor={(v) => sev(v, th.wind_high_kmh, th.wind_moderate_kmh)}
            lines={[{ at: th.wind_moderate_kmh, color: colors.riskModerate }, { at: th.wind_high_kmh, color: colors.error }]}
            overlay={pts.map((p) => p.gust_kmh)}
          />
          <Title label={t.dashboard.forecastWaves} peak={max(waves)} />
          <BarChart
            width={width}
            values={waves}
            hours={hours}
            scaleMax={Math.max(max(waves), th.wave_high_m)}
            colorFor={(v) => sev(v, th.wave_high_m, th.wave_moderate_m)}
            lines={[{ at: th.wave_moderate_m, color: colors.riskModerate }, { at: th.wave_high_m, color: colors.error }]}
          />
          {data.tide_available && (
            <>
              <Title label={t.dashboard.forecastTide} peak={max(tide)} />
              <TideChart width={width} values={tide} hours={hours} />
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.onSurface,
    marginBottom: 8,
  },
  rowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 8,
    marginBottom: 2,
  },
  rowTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  rowMax: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.onSurfaceVariant,
  },
});
