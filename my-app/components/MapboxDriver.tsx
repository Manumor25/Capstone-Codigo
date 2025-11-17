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

export default function MapboxDriver({ driverLocation, simulatedPath, route }: Props) {
  const initial = {
    latitude: driverLocation?.latitude || -33.45,
    longitude: driverLocation?.longitude || -70.6667,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421
  };

  // Crear array de coordenadas para mostrar en el mapa
  const coordinatesToShow: LatLng[] = simulatedPath || (driverLocation ? [driverLocation] : []);

  return (
    <View style={styles.container}>
      <MapView 
        style={styles.map}
        initialRegion={initial}
      >
        {/* Mostrar ubicación del conductor */}
        {driverLocation && (
          <Marker
            key="driver"
            coordinate={driverLocation}
            title="Conductor"
          />
        )}
        
        {/* Mostrar waypoints de la ruta si existe */}
        {route?.waypoints && route.waypoints.map((waypoint, index) => (
          <Marker
            key={`waypoint-${index}`}
            coordinate={waypoint.coordinates}
            title={waypoint.name}
          />
        ))}
        
        {/* Mostrar coordenadas del path simulado si existe */}
        {coordinatesToShow.map((coordinate, index) => (
          <Marker
            key={`path-${index}`}
            coordinate={coordinate}
          />
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
  }
});