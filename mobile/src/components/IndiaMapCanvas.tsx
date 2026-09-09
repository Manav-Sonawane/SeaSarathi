import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, {
  Path,
  Circle,
  G,
  Text as SvgText,
  Polygon,
  Polyline,
  Rect,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import { INDIAN_PORTS, PortInfo } from '../constants/portsAndLanguages';

interface IndiaMapCanvasProps {
  activePort: PortInfo;
  layers: {
    risk: boolean;
    pfz: boolean;
    geofence: boolean;
    wind: boolean;
  };
  onSelectZone?: (zone: any) => void;
  zoom?: number;
  panOffset?: { x: number; y: number };
}

// Map bounds for India Equirectangular projection
const MIN_LAT = 6.0;
const MAX_LAT = 24.5;
const MIN_LON = 67.0;
const MAX_LON = 94.5;

export function projectCoord(lat: number, lon: number, width = 360, height = 440) {
  const x = ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * width;
  const y = height - ((lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * height;
  return { x, y };
}

// Peninsular India simplified high-detail SVG path coordinates
const INDIA_COAST_POINTS: Array<[number, number]> = [
  // West Coast
  [23.5, 68.5], // Kutch north
  [22.5, 69.0], // Okha / Kutch
  [22.8, 70.2], // Kandla
  [22.0, 72.2], // Gulf of Khambhat inner
  [21.6, 69.6], // Porbandar
  [20.9, 70.37], // Veraval
  [20.8, 72.8], // Surat / Daman
  [18.9, 72.8], // Mumbai
  [16.9, 73.2], // Ratnagiri
  [15.4, 73.8], // Goa
  [14.8, 74.1], // Karwar
  [13.3, 74.7], // Malpe / Udupi
  [12.8, 74.8], // Mangalore
  [11.9, 75.3], // Kannur / Azhikkal
  [11.1, 75.8], // Kozhikode
  [10.1, 76.1], // Munambam
  [9.9, 76.2],  // Kochi
  [8.9, 76.5],  // Kollam
  [8.3, 76.9],  // Vizhinjam
  [8.08, 77.5], // Kanyakumari Apex

  // East Coast
  [8.7, 78.1],  // Tuticorin
  [9.2, 79.3],  // Rameswaram / Palk Bay
  [10.7, 79.8], // Nagapattinam
  [11.7, 79.7], // Cuddalore
  [13.1, 80.2], // Chennai
  [14.2, 80.1], // Krishnapatnam
  [16.1, 81.1], // Machilipatnam
  [16.9, 82.2], // Kakinada
  [17.6, 83.2], // Visakhapatnam
  [19.3, 84.9], // Gopalpur
  [20.2, 86.6], // Paradip
  [20.8, 86.9], // Dhamra
  [21.6, 87.5], // Sankarpur / Digha
  [21.8, 88.1], // Kakdwip
  [22.3, 88.3], // Sundarbans East

  // Northern Inland Contour Closing
  [24.5, 88.3],
  [24.5, 75.0],
  [24.0, 69.5],
  [23.5, 68.5],
];

export function IndiaMapCanvas({
  activePort,
  layers,
  zoom = 11,
  panOffset = { x: 0, y: 0 },
}: IndiaMapCanvasProps) {
  const MAP_W = 360;
  const MAP_H = 440;

  // Build India Polygon SVG string
  const indiaPathString = INDIA_COAST_POINTS.map((pt, idx) => {
    const { x, y } = projectCoord(pt[0], pt[1], MAP_W, MAP_H);
    return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ') + ' Z';

  // Selected Port position
  const activePos = projectCoord(activePort.latitude, activePort.longitude, MAP_W, MAP_H);

  // Scale factor
  const scale = zoom / 11;
  const pivotX = activePos.x;
  const pivotY = activePos.y;

  // Derive 2 nearby PFZ zones off active port
  const pfz1Pos = projectCoord(
    activePort.latitude + (activePort.sea.includes('Bay') ? 0.08 : 0.05),
    activePort.longitude + (activePort.sea.includes('Bay') ? 0.15 : -0.15),
    MAP_W,
    MAP_H
  );

  const pfz2Pos = projectCoord(
    activePort.latitude - (activePort.sea.includes('Bay') ? 0.08 : 0.08),
    activePort.longitude + (activePort.sea.includes('Bay') ? 0.22 : -0.22),
    MAP_W,
    MAP_H
  );

  return (
    <View style={styles.container}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${MAP_W} ${MAP_H}`}>
        <Defs>
          <LinearGradient id="oceanGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#0B132B" />
            <Stop offset="50%" stopColor="#1C2541" />
            <Stop offset="100%" stopColor="#0F172A" />
          </LinearGradient>

          <LinearGradient id="landGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#1E293B" />
            <Stop offset="100%" stopColor="#0F172A" />
          </LinearGradient>

          <LinearGradient id="pfzGrad1" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#00E676" stopOpacity="0.4" />
            <Stop offset="100%" stopColor="#00B0FF" stopOpacity="0.3" />
          </LinearGradient>

          <LinearGradient id="pfzGrad2" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#29B6F6" stopOpacity="0.4" />
            <Stop offset="100%" stopColor="#0288D1" stopOpacity="0.3" />
          </LinearGradient>
        </Defs>

        {/* Ocean Background */}
        <Rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#oceanGrad)" />

        {/* Transform Group for Drag/Pan & Zoom */}
        <G
          transform={`translate(${panOffset.x}, ${panOffset.y}) translate(${pivotX}, ${pivotY}) scale(${scale}) translate(${-pivotX}, ${-pivotY})`}
        >
          {/* Ocean Grid Lines */}
          <G stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" strokeDasharray="3,3">
            <Polyline points={`0,${MAP_H * 0.25} ${MAP_W},${MAP_H * 0.25}`} />
            <Polyline points={`0,${MAP_H * 0.5} ${MAP_W},${MAP_H * 0.5}`} />
            <Polyline points={`0,${MAP_H * 0.75} ${MAP_W},${MAP_H * 0.75}`} />
            <Polyline points={`${MAP_W * 0.25},0 ${MAP_W * 0.25},${MAP_H}`} />
            <Polyline points={`${MAP_W * 0.5},0 ${MAP_W * 0.5},${MAP_H}`} />
            <Polyline points={`${MAP_W * 0.75},0 ${MAP_W * 0.75},${MAP_H}`} />
          </G>

          {/* Ocean Sea Names */}
          <SvgText x="35" y={MAP_H - 120} fill="#38BDF8" fontSize="10" fontWeight="bold" opacity="0.6">
            ARABIAN SEA
          </SvgText>
          <SvgText x={MAP_W - 95} y={MAP_H - 140} fill="#38BDF8" fontSize="10" fontWeight="bold" opacity="0.6">
            BAY OF BENGAL
          </SvgText>

          {/* Bathymetry Isobaths */}
          <Path
            d="M 50 120 Q 90 240 140 370 Q 180 410 240 370 Q 300 240 330 110"
            fill="none"
            stroke="#0288D1"
            strokeWidth="1.2"
            strokeDasharray="4,4"
            opacity="0.5"
          />

          {/* India Landmass Polygon */}
          <Path
            d={indiaPathString}
            fill="url(#landGrad)"
            stroke="#334155"
            strokeWidth="2"
          />

          {/* 12 NM Geofence Border Line */}
          {layers.geofence && (
            <Path
              d={indiaPathString}
              fill="none"
              stroke="#EF4444"
              strokeWidth="1.5"
              strokeDasharray="6,4"
              opacity="0.85"
            />
          )}

          {/* Islands */}
          <G fill="#475569">
            <Circle cx={projectCoord(10.56, 72.64, MAP_W, MAP_H).x} cy={projectCoord(10.56, 72.64, MAP_W, MAP_H).y} r="3" />
            <Circle cx={projectCoord(11.62, 92.72, MAP_W, MAP_H).x} cy={projectCoord(11.62, 92.72, MAP_W, MAP_H).y} r="3.5" />
          </G>

          {/* Potential Fishing Zones (PFZ) Overlay */}
          {layers.pfz && (
            <G>
              <Polygon
                points={`
                  ${pfz1Pos.x - 22},${pfz1Pos.y - 12}
                  ${pfz1Pos.x + 22},${pfz1Pos.y - 18}
                  ${pfz1Pos.x + 30},${pfz1Pos.y + 15}
                  ${pfz1Pos.x - 18},${pfz1Pos.y + 18}
                `}
                fill="url(#pfzGrad1)"
                stroke="#00E676"
                strokeWidth="1.5"
              />
              <Polygon
                points={`
                  ${pfz2Pos.x - 20},${pfz2Pos.y - 15}
                  ${pfz2Pos.x + 24},${pfz2Pos.y - 10}
                  ${pfz2Pos.x + 18},${pfz2Pos.y + 20}
                  ${pfz2Pos.x - 22},${pfz2Pos.y + 15}
                `}
                fill="url(#pfzGrad2)"
                stroke="#00B0FF"
                strokeWidth="1.5"
              />
            </G>
          )}

          {/* All Coastal Ports Dots */}
          {INDIAN_PORTS.map((p) => {
            const pt = projectCoord(p.latitude, p.longitude, MAP_W, MAP_H);
            if (p.name === activePort.name) return null;
            return <Circle key={p.id} cx={pt.x} cy={pt.y} r="3" fill="#38BDF8" opacity="0.75" />;
          })}

          {/* HIGHLIGHTED ACTIVE OPERATING PORT */}
          <G>
            <Circle cx={activePos.x} cy={activePos.y} r="14" fill="none" stroke="#4ADE80" strokeWidth="1.5" opacity="0.4" />
            <Circle cx={activePos.x} cy={activePos.y} r="8" fill="none" stroke="#4ADE80" strokeWidth="2" opacity="0.7" />
            <Circle cx={activePos.x} cy={activePos.y} r="4" fill="#22C55E" stroke="#FFFFFF" strokeWidth="1.5" />

            <G x={Math.min(Math.max(activePos.x - 65, 10), MAP_W - 130)} y={Math.max(activePos.y - 35, 10)}>
              <Rect width="130" height="24" rx="6" fill="#0F172A" stroke="#22C55E" strokeWidth="1.5" />
              <SvgText x="65" y="16" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">
                📍 {activePort.name} ({activePort.state})
              </SvgText>
            </G>
          </G>
        </G>
      </Svg>

      {/* Info Strip */}
      <View style={styles.infoStrip}>
        <View style={styles.infoLeft}>
          <View style={styles.greenPulseDot} />
          <Text style={styles.infoText}>
            PORT: <Text style={styles.boldText}>{activePort.name.toUpperCase()}</Text> • ZOOM: {zoom}x
          </Text>
        </View>
        <Text style={styles.seaText}>{activePort.sea.toUpperCase()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  infoStrip: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  infoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  greenPulseDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  infoText: {
    fontSize: 10,
    color: '#94A3B8',
  },
  boldText: {
    fontWeight: '800',
    color: '#FFFFFF',
  },
  seaText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#38BDF8',
  },
});
