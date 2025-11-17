import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

type LatLng = { latitude: number; longitude: number };

interface RouteWaypoint {
  coordinates: LatLng;
  name: string;
  rutHijo?: string;
}

interface Props {
  accessToken?: string;
  driverLocation?: LatLng;
  simulatedPath?: LatLng[];
  route?: {
    waypoints: RouteWaypoint[];
    routeGeometry?: any;
  };
}

// Componente personalizado para el marcador de furgón
const FurgonMarker = () => (
  <View style={styles.markerContainer}>
    <View style={styles.furgonBody}>
      {/* Ventanas */}
      <View style={styles.ventana} />
      <View style={[styles.ventana, styles.ventanaMargin]} />
      <View style={[styles.ventana, styles.ventanaMargin]} />
    </View>
    {/* Ruedas */}
    <View style={styles.ruedaContainer}>
      <View style={styles.rueda} />
      <View style={[styles.rueda, styles.ruedaRight]} />
    </View>
  </View>
);

export default function MapboxDriver({ driverLocation, simulatedPath }: Props) {
  const initial = {
    latitude: driverLocation?.latitude || -33.45,
    longitude: driverLocation?.longitude || -70.6667,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421
  };

  const route = simulatedPath || (driverLocation ? [driverLocation] : []);

  return (
    <View style={styles.container}>
      <MapView 
        style={styles.map}
        initialRegion={initial}
      >
        {route.map((coordinate, index) => (
          <Marker
            key={index}
            coordinate={coordinate}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <FurgonMarker />
          </Marker>
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  map: {
    width: '100%',
    height: '100%'
  },
  markerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
  },
  furgonBody: {
    width: 40,
    height: 24,
    backgroundColor: '#FFD700',
    borderRadius: 3,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingTop: 3,
    paddingLeft: 3,
    flexDirection: 'row',
  },
  ventana: {
    width: 5,
    height: 6,
    backgroundColor: '#87CEEB',
    borderRadius: 1,
  },
  ventanaMargin: {
    marginLeft: 6,
  },
  ruedaContainer: {
    flexDirection: 'row',
    marginTop: 2,
    width: 40,
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  rueda: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  ruedaRight: {
    marginLeft: 0,
  },
});