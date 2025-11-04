import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, StyleSheet, Text, View } from 'react-native';
import MapboxDriver from './MapboxDriver';

// Note: react-native-maps is native-only. We avoid importing it at top-level so web builds don't fail.
// On native platforms we dynamically import the module at runtime.

type LatLng = { latitude: number; longitude: number };

interface Props {
  driverLocation?: LatLng; // si se provee, se usará como ubicación exacta
  simulatedPath?: LatLng[]; // recorrido simulado (opcional)
}

export default function DriverMap({ driverLocation, simulatedPath }: Props) {
  const [region, setRegion] = useState<any>(
    driverLocation
      ? {
          latitude: driverLocation.latitude,
          longitude: driverLocation.longitude,
          latitudeDelta: 0.009,
          longitudeDelta: 0.004,
        }
      : {
          latitude: -33.45,
          longitude: -70.6667,
          latitudeDelta: 0.03,
          longitudeDelta: 0.02,
        },
  );

  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [currentLoc, setCurrentLoc] = useState<LatLng | null>(driverLocation || null);
  const markerRef = useRef<any>(null);
  const heading = useRef(new Animated.Value(0)).current;
  const [MapComponents, setMapComponents] = useState<any>(null);
  const isWeb = (Platform as any).OS === 'web';

  // load react-native-maps only on native platforms
  useEffect(() => {
    const mounted = { v: true };
    const isWeb = (Platform as any).OS === 'web';
    (async () => {
      if (!isWeb) {
        try {
          const maps = await import('react-native-maps');
          if (mounted.v) setMapComponents(maps);
        } catch (e) {
          console.warn('react-native-maps failed to load:', e);
        }
      }
    })();
    return () => {
      mounted.v = false;
    };
  }, []);

  // pedir permiso y, si no hay driverLocation, usar ubicación del dispositivo
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasPermission(status === 'granted');
      if (status === 'granted' && !driverLocation) {
        const loc = await Location.getCurrentPositionAsync({});
        const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setCurrentLoc(coords);
        setRegion((r: any) => ({ ...r, latitude: coords.latitude, longitude: coords.longitude }));
      }
    })();
  }, []);

  // si el prop driverLocation cambia, centrar y animar
  useEffect(() => {
    if (driverLocation) {
      setCurrentLoc(driverLocation);
      setRegion((r: any) => ({ ...r, latitude: driverLocation.latitude, longitude: driverLocation.longitude }));
    }
  }, [driverLocation]);

  // si se entrega un path simulado, avanzar el marcador (simple)
  useEffect(() => {
    if (!simulatedPath || simulatedPath.length === 0) return;
    let i = 0;
    const id = setInterval(() => {
      const p = simulatedPath[i % simulatedPath.length];
      setCurrentLoc(p);
      setRegion((r: any) => ({ ...r, latitude: p.latitude, longitude: p.longitude }));
      i += 1;
    }, 3000);
    return () => clearInterval(id);
  }, [simulatedPath]);

  if (hasPermission === false) {
    return (
      <View style={styles.centered}>
        <Text>No se otorgaron permisos de ubicación.</Text>
      </View>
    );
  }

  if (!currentLoc) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }
  const renderMarker = (MarkerComp: any) => {
    return (
      <MarkerComp coordinate={currentLoc} anchor={{ x: 0.5, y: 0.5 }} ref={markerRef}>
        <View style={styles.markerOuter}>
          <View style={styles.markerCircle} />
          <View style={styles.triangle} />
        </View>
      </MarkerComp>
    );
  };

  const route = simulatedPath && simulatedPath.length > 0 ? simulatedPath : [currentLoc];

  // If web, use MapboxDriver
  if (isWeb) {
    return (
      <View style={styles.container}>
        <MapboxDriver
          accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN}
          driverLocation={currentLoc}
          simulatedPath={simulatedPath}
        />
        <View style={styles.bottomCard}>
          <Text style={styles.etaText}>15 min</Text>
          <Text style={styles.etaSub}>Conductor en camino</Text>
        </View>
      </View>
    );
  }

  // If native but maps still not loaded, show loader
  if (!isWeb && !MapComponents) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const MapView = MapComponents?.default || MapComponents?.MapView;
  const MarkerComp = MapComponents?.Marker || MapComponents?.default?.Marker;
  const Polyline = MapComponents?.Polyline || MapComponents?.default?.Polyline;

  return (
    <View style={styles.container}>
      <MapView
        provider={MapComponents?.PROVIDER_GOOGLE || undefined}
        style={styles.map}
        region={region}
        showsUserLocation={false}
        loadingEnabled
      >
        {Polyline ? (
          <Polyline coordinates={route as any} strokeColor="#1dbb7f" strokeWidth={5} lineCap="round" />
        ) : null}
        {MarkerComp ? renderMarker(MarkerComp) : null}
      </MapView>

      <View style={styles.bottomCard}>
        <Text style={styles.etaText}>15 min</Text>
        <Text style={styles.etaSub}>Conductor en camino</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  markerOuter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(27,187,127,0.12)',
    borderWidth: 2,
    borderColor: '#1dbb7f',
    marginBottom: 4,
  },
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#fff',
    transform: [{ rotate: '0deg' }],
    marginTop: -20,
  },
  bottomCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
  },
  etaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  etaSub: { color: '#fff', fontSize: 12, marginTop: 4 },
});
