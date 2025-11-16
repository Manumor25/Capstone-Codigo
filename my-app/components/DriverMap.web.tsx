import MapboxGL from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import React from 'react';
import { StyleSheet, View } from 'react-native';

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

MapboxGL.accessToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';

export default function DriverMap({ style, initialRegion }: Props) {
  const mapContainer = React.useRef(null);
  const map = React.useRef<mapboxgl.Map | null>(null);

  React.useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new MapboxGL.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [
        initialRegion?.longitude || -70.6667,
        initialRegion?.latitude || -33.45
      ],
      zoom: 12
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  return (
    <View style={[styles.container, style]}>
      <div ref={mapContainer} style={{ ...styles.map, border: '2px solid #000', borderRadius: '15px' }} />
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