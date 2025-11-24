import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

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
    routeGeometry?: any; // GeoJSON LineString
    distancia?: string;
    tiempoEstimado?: number;
  };
}

export default function MapboxDriver({ driverLocation, simulatedPath, route }: Props) {
  const mapRef = useRef<MapView>(null);

  // Validar que las coordenadas sean válidas
  const isValidCoordinate = (coord: LatLng | undefined): boolean => {
    if (!coord) return false;
    return (
      typeof coord.latitude === 'number' &&
      typeof coord.longitude === 'number' &&
      !isNaN(coord.latitude) &&
      !isNaN(coord.longitude) &&
      coord.latitude >= -90 &&
      coord.latitude <= 90 &&
      coord.longitude >= -180 &&
      coord.longitude <= 180
    );
  };

  // Extraer coordenadas de routeGeometry (GeoJSON)
  const getRouteCoordinates = (): LatLng[] => {
    if (!route?.routeGeometry) return [];
    
    try {
      // Si routeGeometry es un objeto GeoJSON con geometry
      if (route.routeGeometry.geometry && route.routeGeometry.geometry.coordinates) {
        return route.routeGeometry.geometry.coordinates.map((coord: number[]) => ({
          longitude: coord[0],
          latitude: coord[1],
        })).filter(isValidCoordinate);
      }
      // Si routeGeometry es un objeto con coordinates directo
      if (route.routeGeometry.coordinates && Array.isArray(route.routeGeometry.coordinates)) {
        return route.routeGeometry.coordinates.map((coord: number[]) => ({
          longitude: coord[0],
          latitude: coord[1],
        })).filter(isValidCoordinate);
      }
      // Si routeGeometry es un array directo
      if (Array.isArray(route.routeGeometry)) {
        return route.routeGeometry.map((coord: number[]) => ({
          longitude: coord[0],
          latitude: coord[1],
        })).filter(isValidCoordinate);
      }
    } catch (error) {
      console.error('Error al procesar routeGeometry:', error);
    }
    
    return [];
  };

  const routeCoordinates = getRouteCoordinates();
  const hasRoute = routeCoordinates.length > 0;

  // Calcular región inicial basada en la ruta o ubicación
  const getInitialRegion = () => {
    if (hasRoute && routeCoordinates.length > 0) {
      // Calcular bounds de la ruta
      const lats = routeCoordinates.map(c => c.latitude);
      const lngs = routeCoordinates.map(c => c.longitude);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      
      const latDelta = (maxLat - minLat) * 1.5 || 0.1;
      const lngDelta = (maxLng - minLng) * 1.5 || 0.1;
      
      return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(latDelta, 0.01),
        longitudeDelta: Math.max(lngDelta, 0.01),
      };
    }
    
    if (driverLocation && isValidCoordinate(driverLocation)) {
      return {
        latitude: driverLocation.latitude,
        longitude: driverLocation.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    
    return {
      latitude: -33.45,
      longitude: -70.6667,
      latitudeDelta: 0.0922,
      longitudeDelta: 0.0421,
    };
  };

  const initialRegion = getInitialRegion();

  // Centrar mapa cuando cambie la ubicación o ruta
  useEffect(() => {
    if (mapRef.current) {
      const region = getInitialRegion();
      mapRef.current.animateToRegion(region, 1000);
    }
  }, [driverLocation, hasRoute]);

  // Crear array de coordenadas para mostrar en el mapa (solo coordenadas válidas)
  const coordinatesToShow: LatLng[] = simulatedPath 
    ? simulatedPath.filter(isValidCoordinate)
    : (driverLocation && isValidCoordinate(driverLocation) ? [driverLocation] : []);

  return (
    <View style={styles.container}>
      <MapView 
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        loadingEnabled={true}
        onMapReady={() => {
          console.log('Mapa cargado correctamente (Android)');
        }}
      >
        {/* Mostrar ruta como Polyline si existe */}
        {hasRoute && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#127067"
            strokeWidth={5}
            lineDashPattern={[]}
            lineCap="round"
            lineJoin="round"
          />
        )}
        
        {/* Mostrar ubicación del conductor con marcador personalizado */}
        {driverLocation && isValidCoordinate(driverLocation) && (
          <Marker
            key="driver"
            coordinate={driverLocation}
            title="Conductor"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.driverMarker}>
              <View style={styles.driverMarkerInner} />
            </View>
          </Marker>
        )}
        
        {/* Mostrar waypoints de la ruta si existe */}
        {route?.waypoints && route.waypoints
          .filter(waypoint => isValidCoordinate(waypoint.coordinates))
          .map((waypoint, index) => (
            <Marker
              key={`waypoint-${index}`}
              coordinate={waypoint.coordinates}
              title={waypoint.name || `Punto ${index + 1}`}
              pinColor="#127067"
            />
          ))}
        
        {/* Mostrar coordenadas del path simulado si existe (solo si no hay ruta) */}
        {coordinatesToShow.length > 0 && !hasRoute && coordinatesToShow.map((coordinate, index) => (
          <Marker
            key={`path-${index}`}
            coordinate={coordinate}
            pinColor="#FFD700"
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 15,
    overflow: 'hidden',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  driverMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#127067',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  driverMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
});
