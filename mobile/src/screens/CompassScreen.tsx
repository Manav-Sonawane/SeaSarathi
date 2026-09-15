import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Platform,
  Linking,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, {
  Circle,
  Line,
  G,
  Text as SvgText,
  Polygon,
} from 'react-native-svg';
import { useUserStore } from '../store/userStore';
import { INDIAN_PORTS, PortInfo } from '../constants/portsAndLanguages';
import { getScreenText } from '../constants/screenTranslations';
import {
  calculateBearing,
  calculateDistanceKm,
  kmToNauticalMiles,
  calculateHeadingDifference,
  getCardinalDirection,
  formatVhfCoordinates,
  estimateTimeToArrival,
} from '../utils/navigationMath';

const DIAL_SIZE = 340;
const CX = DIAL_SIZE / 2; // 170
const CY = DIAL_SIZE / 2; // 170
const R_TICK_OUTER = 126;
const R_NUMBERS = 148;
const R_CARDINAL = 82;

export function CompassScreen() {
  const { portInfo, getLanguageInfo, userName, userId, vesselType } = useUserStore();
  const langInfo = getLanguageInfo();
  const t = getScreenText(langInfo.code);

  // Selected safe destination port (default to user's registered port)
  const [targetPort, setTargetPort] = useState<PortInfo>(portInfo);
  const [isPortModalOpen, setIsPortModalOpen] = useState(false);
  const [isVhfModalOpen, setIsVhfModalOpen] = useState(false);
  const [isCalibModalOpen, setIsCalibModalOpen] = useState(false);

  // Current vessel position (default: ~10 NM offshore of port for realistic demonstration)
  const [vesselLat, setVesselLat] = useState(targetPort.latitude - 0.12);
  const [vesselLon, setVesselLon] = useState(targetPort.longitude - 0.14);
  const [hasGpsFix, setHasGpsFix] = useState(false);

  // Compass Heading (0° = True/Magnetic North, 90° = East, 180° = South, 270° = West)
  const [heading, setHeading] = useState(0);
  const [hasMagnetometer, setHasMagnetometer] = useState(false);

  // Vessel cruising speed based on registered vessel class
  const vesselSpeedKnots =
    vesselType === 'small' ? 5 : vesselType === 'medium' ? 9 : 12;

  // 1. Hardware Orientation / Magnetometer Sensor (Works 100% offline without cellular)
  useEffect(() => {
    let handleOrientation: ((e: any) => void) | null = null;

    if (typeof window !== 'undefined') {
      handleOrientation = (event: any) => {
        let compassHeading: number | null = null;

        // iOS Safari provides webkitCompassHeading directly
        if (typeof event.webkitCompassHeading === 'number') {
          compassHeading = event.webkitCompassHeading;
        } else if (event.absolute && typeof event.alpha === 'number') {
          // Android Chrome with absolute orientation
          compassHeading = 360 - event.alpha;
        } else if (typeof event.alpha === 'number') {
          compassHeading = 360 - event.alpha;
        }

        if (compassHeading != null && !isNaN(compassHeading)) {
          const normalized = ((compassHeading % 360) + 360) % 360;
          setHeading(Math.round(normalized));
          setHasMagnetometer(true);
        }
      };

      if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientationabsolute' as any, handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    }

    return () => {
      if (typeof window !== 'undefined' && handleOrientation) {
        window.removeEventListener('deviceorientationabsolute' as any, handleOrientation, true);
        window.removeEventListener('deviceorientation', handleOrientation, true);
      }
    };
  }, []);

  // 2. Watch Direct Satellite GPS (Works 100% offline without Internet/cellular)
  useEffect(() => {
    let watchId: number | null = null;

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setVesselLat(pos.coords.latitude);
          setVesselLon(pos.coords.longitude);
          setHasGpsFix(true);
          if (pos.coords.heading != null && !isNaN(pos.coords.heading) && pos.coords.heading >= 0) {
            setHeading(Math.round(pos.coords.heading));
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );

      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setVesselLat(pos.coords.latitude);
          setVesselLon(pos.coords.longitude);
          setHasGpsFix(true);
          if (pos.coords.heading != null && !isNaN(pos.coords.heading) && pos.coords.heading >= 0) {
            setHeading(Math.round(pos.coords.heading));
          }
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }

    return () => {
      if (watchId != null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, []);

  // Sync if registered port in store changes
  useEffect(() => {
    setTargetPort(portInfo);
    if (!hasGpsFix) {
      setVesselLat(portInfo.latitude - 0.12);
      setVesselLon(portInfo.longitude - 0.14);
    }
  }, [portInfo]);

  // 3. Navigation Calculations
  const distanceKm = calculateDistanceKm(
    vesselLat,
    vesselLon,
    targetPort.latitude,
    targetPort.longitude
  );
  const distanceNm = kmToNauticalMiles(distanceKm);
  const targetBearing = calculateBearing(
    vesselLat,
    vesselLon,
    targetPort.latitude,
    targetPort.longitude
  );
  const steering = calculateHeadingDifference(heading, targetBearing, 5.0);
  const eta = estimateTimeToArrival(distanceKm, vesselSpeedKnots);
  const currentCardinal = getCardinalDirection(heading);
  const targetCardinal = getCardinalDirection(targetBearing);
  const vhfCoords = formatVhfCoordinates(vesselLat, vesselLon);

  // Dial rotation: To keep vessel prow at 12 o'clock, rotate dial counter-clockwise by heading
  const dialRotation = -heading;

  // Calculate nearest safe harbor & sorted port list by distance
  const { nearestPort, sortedPorts } = useMemo(() => {
    const mapped = INDIAN_PORTS.map((p) => {
      const dist = calculateDistanceKm(vesselLat, vesselLon, p.latitude, p.longitude);
      return { ...p, distanceKm: dist };
    });

    // Sort ascending so the closest ports appear first
    const sorted = [...mapped].sort((a, b) => a.distanceKm - b.distanceKm);
    return { nearestPort: sorted[0], sortedPorts: sorted };
  }, [vesselLat, vesselLon]);

  // Switch to nearest safe harbor
  const handleSwitchToNearest = () => {
    setTargetPort(nearestPort);
  };

  // Adjust heading manually for calibration or testing
  const adjustHeading = (delta: number) => {
    setHeading((prev) => ((prev + delta + 360) % 360));
  };

  // ─── SVG Dial Elements Memoization ──────────────────────────────────────────
  // Pre-calculate 180 tick marks (every 2 degrees)
  const ticks = useMemo(() => {
    const list = [];
    for (let deg = 0; deg < 360; deg += 2) {
      const isMajor = deg % 30 === 0;
      const isMedium = deg % 10 === 0 && !isMajor;
      const length = isMajor ? 16 : isMedium ? 11 : 6.5;
      const strokeWidth = isMajor ? 2.0 : isMedium ? 1.4 : 0.85;
      const strokeColor = isMajor
        ? '#FFFFFF'
        : isMedium
        ? 'rgba(255, 255, 255, 0.9)'
        : 'rgba(255, 255, 255, 0.55)';

      const rad = ((deg - 90) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const x1 = CX + (R_TICK_OUTER - length) * cos;
      const y1 = CY + (R_TICK_OUTER - length) * sin;
      const x2 = CX + R_TICK_OUTER * cos;
      const y2 = CY + R_TICK_OUTER * sin;

      list.push({ deg, x1, y1, x2, y2, strokeWidth, strokeColor });
    }
    return list;
  }, []);

  // Degree numbers around the rim: 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330
  const degreeNumbers = useMemo(() => {
    const list = [];
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = ((deg - 90) * Math.PI) / 180;
      const x = CX + R_NUMBERS * Math.cos(rad);
      const y = CY + R_NUMBERS * Math.sin(rad);
      list.push({ deg, label: deg.toString(), x, y });
    }
    return list;
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Subtle Minimalist Status Header */}
        <View style={styles.topStatusHeader}>
          <View style={styles.offlineStatusRow}>
            <View style={styles.liveGreenDot} />
            <Text style={styles.offlineStatusText}>
              {hasGpsFix ? 'OFFLINE SATELLITE GPS ACTIVE' : 'CALAMITY SAFE MODE • 100% OFFLINE'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setIsCalibModalOpen(true)}
            style={styles.calibToggleBtn}
            activeOpacity={0.7}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color="#38BDF8"
            />
            <Text style={styles.calibToggleText}>Calibrate</Text>
          </TouchableOpacity>
        </View>

        {/* ─── Apple-Style Hero Compass Display ──────────────────────────────── */}
        <View style={styles.compassContainer}>
          {/* Fixed Top Lubber Line Indicator (at 12 o'clock) */}
          <View style={styles.fixedLubberContainer}>
            <View style={styles.fixedLubberBar} />
          </View>

          {/* Rotating Compass Dial Disc */}
          <View
            style={[
              styles.rotatingDialWrapper,
              { transform: [{ rotate: `${dialRotation}deg` }] },
            ]}
          >
            <Svg width={DIAL_SIZE} height={DIAL_SIZE} viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}>
              {/* 1. All 180 Tick Marks (every 2 degrees) */}
              {ticks.map((t) => (
                <Line
                  key={`tick-${t.deg}`}
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                  stroke={t.strokeColor}
                  strokeWidth={t.strokeWidth}
                  strokeLinecap="round"
                />
              ))}

              {/* 2. Degree Numbers: 0, 30, 60, ... 330 (Upright along circle) */}
              {degreeNumbers.map((d) => (
                <SvgText
                  key={`num-${d.deg}`}
                  x={d.x}
                  y={d.y + 4.5} // Optical vertical center adjustment
                  fill="#FFFFFF"
                  fontSize={12.5}
                  fontWeight="400"
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              ))}

              {/* 3. North Red Arrow (Pointing UP at 0° between tick ring & 0 mark) */}
              <Polygon
                points={`${CX},${CY - 139} ${CX - 6},${CY - 127} ${CX + 6},${CY - 127}`}
                fill="#EF4444"
              />

              {/* 4. Cardinal Direction Labels: N, E, S, W */}
              <SvgText
                x={CX}
                y={CY - R_CARDINAL + 8}
                fill="#FFFFFF"
                fontSize={25}
                fontWeight="500"
                textAnchor="middle"
              >
                N
              </SvgText>
              <SvgText
                x={CX + R_CARDINAL}
                y={CY + 8}
                fill="#FFFFFF"
                fontSize={25}
                fontWeight="500"
                textAnchor="middle"
              >
                E
              </SvgText>
              <SvgText
                x={CX}
                y={CY + R_CARDINAL + 8}
                fill="#FFFFFF"
                fontSize={25}
                fontWeight="500"
                textAnchor="middle"
              >
                S
              </SvgText>
              <SvgText
                x={CX - R_CARDINAL}
                y={CY + 8}
                fill="#FFFFFF"
                fontSize={25}
                fontWeight="500"
                textAnchor="middle"
              >
                W
              </SvgText>

              {/* 5. Center Dark Circular Hub */}
              <Circle cx={CX} cy={CY} r={38} fill="#1C1C1E" />

              {/* 6. Thin Center Horizontal Line through Hub */}
              <Line
                x1={CX - 68}
                y1={CY}
                x2={CX + 68}
                y2={CY}
                stroke="rgba(255, 255, 255, 0.35)"
                strokeWidth={1}
              />

              {/* 7. Center Crosshairs (+) */}
              <Line
                x1={CX}
                y1={CY - 10}
                x2={CX}
                y2={CY + 10}
                stroke="#FFFFFF"
                strokeWidth={1.2}
              />
              <Line
                x1={CX - 10}
                y1={CY}
                x2={CX + 10}
                y2={CY}
                stroke="#FFFFFF"
                strokeWidth={1.2}
              />

              {/* 8. Luminous Safe Harbor Waypoint Beacon on Rim (Marine Emergency Guidance) */}
              <G transform={`rotate(${targetBearing}, ${CX}, ${CY})`}>
                <Polygon
                  points={`${CX},${CY - R_TICK_OUTER - 2} ${CX - 5},${CY - R_TICK_OUTER + 8} ${CX + 5},${CY - R_TICK_OUTER + 8}`}
                  fill="#10B981"
                />
                <Circle cx={CX} cy={CY - R_TICK_OUTER + 12} r={2.5} fill="#10B981" />
              </G>
            </Svg>
          </View>
        </View>

        {/* ─── Iconic Apple-Style Large Heading Readout ──────────────────────── */}
        <View style={styles.headingReadoutContainer}>
          <Text style={styles.headingBigText}>
            {heading}° {currentCardinal}
          </Text>
        </View>

        {/* ─── Marine Return-To-Shore Navigation Status ──────────────────────── */}
        <View style={styles.marineStatusContainer}>
          {/* Precise GPS Coordinates */}
          <Text style={styles.coordsText}>{vhfCoords}</Text>

          {/* Safe Harbor Destination Line */}
          <View style={styles.harborInfoRow}>
            <Text style={styles.harborTitleText}>
              {targetPort.name} Harbor
            </Text>
            <Text style={styles.harborDot}>•</Text>
            <Text style={styles.harborDistanceText}>
              {distanceNm} NM ({distanceKm} km)
            </Text>
            <Text style={styles.harborDot}>•</Text>
            <Text style={styles.harborBearingText}>
              {Math.round(targetBearing)}° {targetCardinal}
            </Text>
          </View>

          {/* Rudder Steering Guidance Pill */}
          <View
            style={[
              styles.steeringGuidancePill,
              steering.isOnCourse ? styles.pillOnCourse : styles.pillOffCourse,
            ]}
          >
            {steering.isOnCourse ? (
              <>
                <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                <Text style={styles.steeringGuidanceTextOnCourse}>
                  {t.compass.onCourse} ({Math.round(targetBearing)}° {targetCardinal})
                </Text>
              </>
            ) : steering.direction === 'STEER_STARBOARD' ? (
              <>
                <MaterialCommunityIcons name="steering" size={16} color="#F59E0B" />
                <Text style={styles.steeringGuidanceTextOffCourse}>
                  {t.compass.steerStarboard} {steering.degreesOff}° →
                </Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="steering" size={16} color="#F59E0B" />
                <Text style={styles.steeringGuidanceTextOffCourse}>
                  ← {t.compass.steerPort} {steering.degreesOff}°
                </Text>
              </>
            )}
          </View>
        </View>

        {/* ─── Marine Action Buttons (Dark Glass Aesthetic) ─────────────────── */}
        <View style={styles.actionPillsContainer}>
          <TouchableOpacity
            style={styles.actionPill}
            onPress={() => setIsPortModalOpen(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="boat-outline" size={18} color="#38BDF8" />
            <Text style={styles.actionPillText}>Select Safe Harbor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionPill, styles.actionPillSos]}
            onPress={() => setIsVhfModalOpen(true)}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="radio-tower" size={18} color="#EF4444" />
            <Text style={[styles.actionPillText, { color: '#EF4444' }]}>VHF 16 / MAYDAY</Text>
          </TouchableOpacity>
        </View>

        {/* ETA & Cruising Speed Strip */}
        <View style={styles.etaStrip}>
          <Text style={styles.etaStripText}>
            Estimated Shore Arrival: <Text style={styles.etaHighlight}>{eta.formatted}</Text> at {vesselSpeedKnots} knots cruising speed
          </Text>
        </View>
      </ScrollView>

      {/* ─── Emergency VHF Channel 16 / MAYDAY Protocol Modal ──────────────── */}
      <Modal visible={isVhfModalOpen} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="radio-tower" size={22} color="#EF4444" />
                <Text style={styles.modalTitle}>EMERGENCY VHF RADIO PROTOCOL</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsVhfModalOpen(false)}
                style={styles.closeModalBtn}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: 16 }}>
              {/* Formatted Coordinates Box */}
              <View style={styles.vhfCoordCard}>
                <Text style={styles.vhfCoordLabel}>YOUR EXACT GPS COORDINATES (READ OVER RADIO):</Text>
                <Text style={styles.vhfCoordValue}>{vhfCoords}</Text>
                <Text style={styles.vhfCoordSub}>Format: Degrees & Minutes (Standard Indian Navy & Coast Guard)</Text>
              </View>

              {/* Call Coast Guard Hotline */}
              <TouchableOpacity
                style={styles.coastGuardHotlineBtn}
                onPress={() => Linking.openURL('tel:1554').catch(() => {})}
                activeOpacity={0.85}
              >
                <Ionicons name="call" size={18} color="#FFFFFF" />
                <Text style={styles.coastGuardHotlineText}>Call Coast Guard SAR: 1554 (Toll-Free)</Text>
              </TouchableOpacity>

              {/* Offline Voice Script */}
              <View style={styles.maydayBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Ionicons name="megaphone" size={18} color="#F59E0B" />
                  <Text style={styles.maydayHeading}>OFFLINE MAYDAY VOICE SCRIPT</Text>
                </View>
                <Text style={styles.maydayScriptText}>
                  "{t.compass.maydayScript
                    .replace('[Name/ID]', `${userName || 'Fisherman'} (${userId || 'USR-SEASARATHI'})`)
                    .replace('{coords}', vhfCoords)}"
                </Text>
              </View>

              <View style={styles.vhfRadioTip}>
                <Ionicons name="information-circle" size={16} color="#94A3B8" />
                <Text style={styles.vhfRadioTipText}>
                  VHF Channel 16 (156.8 MHz) does NOT require cellular or data towers. Coastal stations monitor 24/7.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── Coastal Port Selection Modal (40+ Ports) ───────────────────────── */}
      <Modal visible={isPortModalOpen} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>SELECT SAFE HARBOR</Text>
              <TouchableOpacity
                onPress={() => setIsPortModalOpen(false)}
                style={styles.closeModalBtn}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Quick 1-Tap Option: Nearest Port */}
            <TouchableOpacity
              style={[
                styles.nearestPortCard,
                targetPort.id === nearestPort.id && styles.nearestPortCardActive,
              ]}
              onPress={() => {
                setTargetPort(nearestPort);
                setIsPortModalOpen(false);
              }}
              activeOpacity={0.8}
            >
              <View style={styles.nearestPortHeader}>
                <View style={styles.nearestIconBox}>
                  <MaterialCommunityIcons name="near-me" size={20} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nearestPortTitle}>
                    📍 {nearestPort.name} (Nearest)
                  </Text>
                  <Text style={styles.nearestPortSub}>
                    {nearestPort.state} • {nearestPort.sea} ({nearestPort.distanceKm} km / {kmToNauticalMiles(nearestPort.distanceKm)} NM away)
                  </Text>
                </View>
                <View
                  style={[
                    styles.nearestSelectBadge,
                    targetPort.id === nearestPort.id && styles.nearestSelectBadgeActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.nearestSelectBadgeText,
                      targetPort.id === nearestPort.id && styles.nearestSelectBadgeTextActive,
                    ]}
                  >
                    {targetPort.id === nearestPort.id ? 'SELECTED' : 'SNAP'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.allPortsDivider}>
              <Text style={styles.allPortsDividerText}>
                ALL COASTAL HARBORS ({sortedPorts.length})
              </Text>
            </View>

            <ScrollView style={styles.portModalList}>
              {sortedPorts.map((p) => {
                const isSelected = targetPort.name.toLowerCase() === p.name.toLowerCase();
                const isNearest = p.id === nearestPort.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.modalPortItem, isSelected && styles.modalPortItemActive]}
                    onPress={() => {
                      setTargetPort(p);
                      setIsPortModalOpen(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={[styles.modalPortName, isSelected && styles.modalPortNameActive]}>
                          📍 {p.name}{isNearest ? ' (Nearest)' : ''}
                        </Text>
                        {isNearest && (
                          <View style={styles.nearestInlineBadge}>
                            <Text style={styles.nearestInlineBadgeText}>NEAREST</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.modalPortSub}>
                        {p.state} • {p.sea} ({p.latitude.toFixed(2)}° N, {p.longitude.toFixed(2)}° E)
                      </Text>
                    </View>
                    <Text style={[styles.modalPortDist, isSelected && styles.modalPortDistActive]}>
                      {p.distanceKm} km
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── Compass Calibration & Helm Simulator Modal ────────────────────── */}
      <Modal visible={isCalibModalOpen} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="options" size={22} color="#38BDF8" />
                <Text style={styles.modalTitle}>HEADING CALIBRATION & SIMULATOR</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsCalibModalOpen(false)}
                style={styles.closeModalBtn}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: 16 }}>
              {/* Sensor Status Card */}
              <View style={styles.sensorStatusCard}>
                <View style={styles.sensorStatusRow}>
                  <Text style={styles.sensorStatusLabel}>SENSOR TELEMETRY</Text>
                  <View style={styles.sensorBadge}>
                    <View
                      style={[
                        styles.sensorDot,
                        { backgroundColor: hasMagnetometer ? '#10B981' : '#F59E0B' },
                      ]}
                    />
                    <Text style={styles.sensorBadgeText}>
                      {hasMagnetometer ? 'Hardware Magnetometer Active' : 'Manual Simulation Active'}
                    </Text>
                  </View>
                </View>
                <View style={styles.sensorHeadingRow}>
                  <View>
                    <Text style={styles.sensorSubLabel}>CURRENT HEADING</Text>
                    <Text style={styles.sensorHeadingValue}>
                      {heading}° <Text style={styles.sensorHeadingCardinal}>{currentCardinal}</Text>
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.sensorSubLabel}>SHORE BEARING</Text>
                    <Text style={[styles.sensorHeadingValue, { color: '#10B981' }]}>
                      {Math.round(targetBearing)}°{' '}
                      <Text style={{ color: '#10B981', fontSize: 16 }}>{targetCardinal}</Text>
                    </Text>
                  </View>
                </View>
              </View>

              {/* Quick Steer Adjustment Buttons */}
              <Text style={styles.calibSectionTitle}>MANUAL HELM STEER (TEST ROTATION)</Text>
              <View style={styles.calibButtonGroup}>
                <TouchableOpacity
                  style={styles.calibBtn}
                  onPress={() => adjustHeading(-15)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.calibBtnText}>-15°</Text>
                  <Text style={styles.calibBtnSub}>Port</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.calibBtn}
                  onPress={() => adjustHeading(-5)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.calibBtnText}>-5°</Text>
                  <Text style={styles.calibBtnSub}>Port</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.calibBtn}
                  onPress={() => adjustHeading(+5)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.calibBtnText}>+5°</Text>
                  <Text style={styles.calibBtnSub}>Starboard</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.calibBtn}
                  onPress={() => adjustHeading(+15)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.calibBtnText}>+15°</Text>
                  <Text style={styles.calibBtnSub}>Starboard</Text>
                </TouchableOpacity>
              </View>

              {/* Navigation Presets */}
              <Text style={styles.calibSectionTitle}>NAVIGATION PRESETS</Text>
              <View style={styles.presetGrid}>
                <TouchableOpacity
                  style={[styles.presetBtn, styles.presetBtnShore]}
                  onPress={() => setHeading(Math.round(targetBearing))}
                  activeOpacity={0.75}
                >
                  <Ionicons name="locate" size={20} color="#10B981" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.presetBtnTitleShore}>
                      Lock Shore Bearing ({Math.round(targetBearing)}° {targetCardinal})
                    </Text>
                    <Text style={styles.presetBtnSubShore}>
                      Snaps prow to {targetPort.name} Harbor
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.presetBtn}
                  onPress={() => setHeading(0)}
                  activeOpacity={0.75}
                >
                  <Ionicons name="compass-outline" size={20} color="#FFFFFF" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.presetBtnTitle}>Point Magnetic North (000° N)</Text>
                    <Text style={styles.presetBtnSub}>Reset compass dial to 0°</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Close Button */}
              <TouchableOpacity
                style={styles.calibDoneBtn}
                onPress={() => setIsCalibModalOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.calibDoneBtnText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollContent: {
    paddingBottom: 40,
    alignItems: 'center',
  },

  // Top Minimal Status Bar
  topStatusHeader: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  offlineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  offlineStatusText: {
    fontSize: 11,
    color: '#8E8E93',
    letterSpacing: 0.8,
    fontWeight: '500',
  },
  calibToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
  },
  calibToggleText: {
    fontSize: 11.5,
    color: '#38BDF8',
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Hero Compass Container
  compassContainer: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    position: 'relative',
  },

  // Fixed Top Lubber Line Indicator (at 12 o'clock, outside rotating disc)
  fixedLubberContainer: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -1.5,
    zIndex: 10,
    alignItems: 'center',
  },
  fixedLubberBar: {
    width: 3,
    height: 18,
    backgroundColor: '#FFFFFF',
    borderRadius: 1.5,
  },

  // Rotating Dial Wrapper
  rotatingDialWrapper: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Iconic Apple-Style Large Heading Readout
  headingReadoutContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
    marginBottom: 10,
  },
  headingBigText: {
    fontSize: 66,
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: -1,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-light',
  },

  // Marine Navigation Status
  marineStatusContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  coordsText: {
    fontSize: 14,
    color: '#8E8E93',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 6,
  },
  harborInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  harborTitleText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  harborDot: {
    fontSize: 14,
    color: '#636366',
  },
  harborDistanceText: {
    fontSize: 14,
    color: '#E5E5EA',
  },
  harborBearingText: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
  },

  // Rudder Steering Guidance Pill
  steeringGuidancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillOnCourse: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  pillOffCourse: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  steeringGuidanceTextOnCourse: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  steeringGuidanceTextOffCourse: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // Action Pills
  actionPillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  actionPillSos: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  actionPillCalib: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  actionPillText: {
    fontSize: 12.5,
    color: '#FFFFFF',
    fontWeight: '500',
  },

  // Calibration Modal Styles
  sensorStatusCard: {
    backgroundColor: '#000000',
    padding: 16,
    borderRadius: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  sensorStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sensorStatusLabel: {
    fontSize: 10,
    color: '#8E8E93',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  sensorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  sensorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sensorBadgeText: {
    fontSize: 10.5,
    color: '#E5E5EA',
    fontWeight: '500',
  },
  sensorHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  sensorSubLabel: {
    fontSize: 10,
    color: '#8E8E93',
    marginBottom: 4,
  },
  sensorHeadingValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  sensorHeadingCardinal: {
    fontSize: 16,
    color: '#38BDF8',
  },
  calibSectionTitle: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '700',
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 10,
  },
  calibButtonGroup: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  calibBtn: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calibBtnText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  calibBtnSub: {
    fontSize: 9.5,
    color: '#8E8E93',
    marginTop: 2,
  },
  presetGrid: {
    gap: 10,
  },
  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#2C2C2E',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  presetBtnShore: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  presetBtnTitleShore: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#10B981',
  },
  presetBtnSubShore: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  presetBtnTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  presetBtnSub: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  calibDoneBtn: {
    backgroundColor: '#38BDF8',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  calibDoneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#041021',
  },

  // ETA Strip
  etaStrip: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  etaStripText: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
  etaHighlight: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 30,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  closeModalBtn: {
    padding: 4,
  },
  vhfCoordCard: {
    backgroundColor: '#000000',
    padding: 16,
    borderRadius: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  vhfCoordLabel: {
    fontSize: 10,
    color: '#8E8E93',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  vhfCoordValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  vhfCoordSub: {
    fontSize: 11,
    color: '#636366',
  },
  coastGuardHotlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 14,
  },
  coastGuardHotlineText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  maydayBox: {
    backgroundColor: '#000000',
    padding: 16,
    borderRadius: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  maydayHeading: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  maydayScriptText: {
    fontSize: 13,
    color: '#E5E5EA',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  vhfRadioTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  vhfRadioTipText: {
    flex: 1,
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 16,
  },
  portModalList: {
    maxHeight: 450,
  },
  modalPortItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  modalPortItemActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
  },
  modalPortName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalPortNameActive: {
    color: '#38BDF8',
  },
  modalPortSub: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  modalPortDist: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  modalPortDistActive: {
    color: '#38BDF8',
  },

  // Nearest Port Card in Modal
  nearestPortCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#10B981',
  },
  nearestPortCardActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    borderColor: '#34D399',
  },
  nearestPortHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nearestIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearestPortTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10B981',
  },
  nearestPortSub: {
    fontSize: 11.5,
    color: '#A7F3D0',
    marginTop: 2,
  },
  nearestSelectBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  nearestSelectBadgeActive: {
    backgroundColor: '#2C2C2E',
  },
  nearestSelectBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#041021',
  },
  nearestSelectBadgeTextActive: {
    color: '#10B981',
  },
  allPortsDivider: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  allPortsDividerText: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  nearestInlineBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#10B981',
  },
  nearestInlineBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.5,
  },
});
