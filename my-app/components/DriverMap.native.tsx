import React from 'react';
import { StyleSheet, View } from 'react-native';
import MapView from 'react-native-maps';

interface Props {
  style?: any;
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  children?: React.ReactNode;
}

export default function DriverMap({ style, initialRegion, children }: Props) {
  const defaultRegion = {
    latitude: -33.45,
    longitude: -70.6667,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  };

  return (
    <View style={[styles.container, style]}>
      <MapView
        style={styles.map}
        initialRegion={initialRegion || defaultRegion}
      >
        {children}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '100%',
  },
});