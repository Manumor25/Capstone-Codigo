import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

type LatLng = { latitude: number; longitude: number };

interface Props {
  accessToken?: string;
  driverLocation?: LatLng;
  simulatedPath?: LatLng[];
}

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