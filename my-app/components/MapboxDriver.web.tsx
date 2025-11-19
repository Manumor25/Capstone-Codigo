import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/firebaseConfig';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';

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

// Función para formatear tiempo en formato "Xh.Ym"
const formatTiempo = (minutos: number): string => {
  if (minutos < 60) {
    return `${minutos}m`;
  }
  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  return `${horas}h.${minutosRestantes}m`;
};

export default function MapboxDriver({ accessToken, driverLocation, simulatedPath, route }: Props) {
  const mapContainer = useRef(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const routeMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const routeLayerRef = useRef<string | null>(null);
  const rutaAnimadaRef = useRef<string | null>(null); // Para rastrear si ya se animó esta ruta
  const [direccion, setDireccion] = useState<string>('');
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  
  // Token de Mapbox del usuario (puede sobrescribir el accessToken del prop)
  const MAPBOX_TOKEN = 'pk.eyJ1IjoiYmFydG94IiwiYSI6ImNtaGpxaGZudzE4NHMycnB0bnMwdjVtbHIifQ.Makrf18R1Z9Wo4V-yMXUYw';
  const tokenToUse = MAPBOX_TOKEN || accessToken;

  // Si se pasa driverLocation como prop, usarlo directamente y no buscar en Firebase
  useEffect(() => {
    if (driverLocation) {
      setUserLocation(null); // Limpiar userLocation para usar driverLocation
      // Hacer reverse geocoding para obtener la dirección
      if (tokenToUse) {
        fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${driverLocation.longitude},${driverLocation.latitude}.json?access_token=${tokenToUse}&limit=1&types=address`
        )
          .then((response) => response.json())
          .then((data) => {
            if (data.features && data.features.length > 0) {
              setDireccion(data.features[0].place_name || 'Ubicación actual');
            } else {
              setDireccion('Ubicación actual');
            }
          })
          .catch(() => {
            setDireccion('Ubicación actual');
          });
      }
      return; // Salir temprano si hay driverLocation
    }
  }, [driverLocation, tokenToUse]);

  // Obtener ubicación exacta del conductor/usuario (solo si no hay driverLocation)
  useEffect(() => {
    if (driverLocation) return; // No ejecutar si ya hay driverLocation

    const obtenerUbicacionExacta = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (!rutGuardado) return;

        // 1. PRIMERO: Intentar obtener ubicación GPS del navegador (más precisa)
        if (navigator.geolocation && tokenToUse) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const { latitude, longitude } = position.coords;
              console.log('Ubicación GPS obtenida:', { latitude, longitude });
              
              // Hacer reverse geocoding para obtener la dirección exacta
              try {
                const reverseResponse = await fetch(
                  `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${tokenToUse}&limit=1&types=address`
                );
                const reverseData = await reverseResponse.json();
                
                if (reverseData.features && reverseData.features.length > 0) {
                  const address = reverseData.features[0].place_name || reverseData.features[0].text;
                  setDireccion(address);
                  setUserLocation({ latitude, longitude });
                  console.log('Dirección obtenida desde GPS:', address);
                  return;
                }
              } catch (error) {
                console.log('Error en reverse geocoding:', error);
              }
              
              // Si no se puede obtener la dirección, usar las coordenadas directamente
              setUserLocation({ latitude, longitude });
              setDireccion('Ubicación actual');
            },
            (error) => {
              console.log('Error al obtener ubicación GPS:', error);
              // Continuar con el método de geocoding
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0
            }
          );
        }

        // 2. SEGUNDO: Intentar obtener coordenadas exactas desde Firebase
        let coordenadasExactas: { latitude: number; longitude: number } | null = null;
        let direccionConductor = '';
        let rutConductor = '';

        try {
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          const listaPasajerosSnap = await getDocs(
            query(listaPasajerosRef, where('rutApoderado', '==', rutGuardado), limit(1))
          );

          if (!listaPasajerosSnap.empty) {
            const data = listaPasajerosSnap.docs[0].data();
            rutConductor = (data.rutConductor || '').toString().trim();
            
            // Verificar si hay coordenadas guardadas
            if (data.latitude && data.longitude) {
              coordenadasExactas = {
                latitude: data.latitude,
                longitude: data.longitude
              };
            }
          }
        } catch (error) {
          console.log('No se pudo obtener el conductor desde lista_pasajeros:', error);
        }

        // Si encontramos coordenadas exactas, usarlas
        if (coordenadasExactas) {
          setUserLocation(coordenadasExactas);
          setDireccion('Ubicación del conductor');
          return;
        }

        // 3. TERCERO: Obtener dirección del conductor desde Firebase y geocodificar
        if (rutConductor) {
          try {
            const usuariosRef = collection(db, 'usuarios');
            const q = query(usuariosRef, where('rut', '==', rutConductor));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
              const data = snapshot.docs[0].data();
              direccionConductor = data.direccion || '';
              
              // Verificar si hay coordenadas guardadas en el usuario
              if (data.latitude && data.longitude) {
                coordenadasExactas = {
                  latitude: data.latitude,
                  longitude: data.longitude
                };
                setUserLocation(coordenadasExactas);
                setDireccion(direccionConductor || 'Ubicación del conductor');
                return;
              }
            }
          } catch (error) {
            console.log('No se pudo obtener la dirección del conductor:', error);
          }
        }

        // Si no hay dirección del conductor, usar la dirección del apoderado como fallback
        if (!direccionConductor) {
          const usuariosRef = collection(db, 'usuarios');
          const q = query(usuariosRef, where('rut', '==', rutGuardado));
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            direccionConductor = data.direccion || '';
            
            // Verificar si hay coordenadas guardadas en el apoderado
            if (data.latitude && data.longitude) {
              coordenadasExactas = {
                latitude: data.latitude,
                longitude: data.longitude
              };
              setUserLocation(coordenadasExactas);
              setDireccion(direccionConductor || 'Mi ubicación');
              return;
            }
          }
        }

        // 4. CUARTO: Geocodificar la dirección usando Mapbox Geocoding API con mayor precisión
        if (direccionConductor && tokenToUse) {
          try {
            const direccionConPais = `${direccionConductor}, Chile`;
            const encodedAddress = encodeURIComponent(direccionConPais);
            
            // bbox para Chile (más preciso): [-75.644395, -55.985989, -66.417968, -17.507979]
            const bbox = '-75.644395,-55.985989,-66.417968,-17.507979';
            
            // Intentar con tipos específicos para mayor precisión (address tiene mayor precisión)
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${tokenToUse}&limit=1&country=cl&types=address&bbox=${bbox}&proximity=-70.6693,-33.4489&language=es`
            );
            const data = await response.json();
            
            if (data.features && data.features.length > 0) {
              const feature = data.features[0];
              const [lng, lat] = feature.center;
              
              console.log('Geocoding resultado:', {
                relevance: feature.relevance,
                accuracy: feature.properties?.accuracy,
                address: feature.place_name
              });
              
              // Usar si la relevancia es buena (>= 0.5) o si es el único resultado
              if (feature.relevance >= 0.5 || data.features.length === 1) {
                setUserLocation({ latitude: lat, longitude: lng });
                setDireccion(feature.place_name || direccionConductor);
                return;
              }
            }
            
            // Fallback: intentar sin restricción de tipos
            const fallbackResponse = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${tokenToUse}&limit=1&country=cl&bbox=${bbox}&proximity=-70.6693,-33.4489&language=es`
            );
            const fallbackData = await fallbackResponse.json();
            
            if (fallbackData.features && fallbackData.features.length > 0) {
              const feature = fallbackData.features[0];
              const [lng, lat] = feature.center;
              setUserLocation({ latitude: lat, longitude: lng });
              setDireccion(feature.place_name || direccionConductor);
            }
          } catch (error) {
            console.error('Error al geocodificar la dirección:', error);
          }
        }
      } catch (error) {
        console.error('Error al obtener la ubicación:', error);
      }
    };

    obtenerUbicacionExacta();
  }, [tokenToUse, driverLocation]);

  useEffect(() => {
    if (!accessToken) {
      console.error('Mapbox token is required');
      return;
    }

    if (!mapContainer.current) return;

    // Solo crear el mapa una vez
    if (!map.current) {
      mapboxgl.accessToken = tokenToUse || accessToken;

      const initialLocation = {
        lng: -70.6667,
        lat: -33.45
      };

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [initialLocation.lng, initialLocation.lat],
        zoom: 14,
        pitch: 0,
        bearing: 0
      });

      // Deshabilitar rotación e inclinación 3D
      map.current.dragRotate.disable();
      map.current.touchPitch.disable();
      map.current.touchZoomRotate.disableRotation();
    }

    // Cleanup
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [accessToken]);

  // Actualizar ubicación cuando cambie userLocation o driverLocation
  useEffect(() => {
    if (!map.current) return;

    const locationToUse = userLocation || driverLocation;
    
    // Limpiar marcador anterior si existe
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    // Limpiar todos los marcadores existentes
    const markers = document.getElementsByClassName('mapboxgl-marker');
    Array.from(markers).forEach((marker) => {
      marker.remove();
    });

    if (locationToUse) {
      // Crear marcador de furgón
      const el = document.createElement('div');
      el.className = 'custom-location-marker';
      el.style.width = '48px';
      el.style.height = '48px';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.zIndex = '1000';
      el.style.filter = 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))';

      // SVG de furgón
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '48');
      svg.setAttribute('height', '48');
      svg.setAttribute('viewBox', '0 0 48 48');
      svg.style.display = 'block';

      // Cuerpo del furgón
      const cuerpo = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      cuerpo.setAttribute('x', '8');
      cuerpo.setAttribute('y', '18');
      cuerpo.setAttribute('width', '32');
      cuerpo.setAttribute('height', '20');
      cuerpo.setAttribute('rx', '3');
      cuerpo.setAttribute('fill', '#FFD700');
      svg.appendChild(cuerpo);

      // Ventanas delanteras
      const ventana1 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      ventana1.setAttribute('x', '10');
      ventana1.setAttribute('y', '20');
      ventana1.setAttribute('width', '6');
      ventana1.setAttribute('height', '8');
      ventana1.setAttribute('rx', '1');
      ventana1.setAttribute('fill', '#87CEEB');
      svg.appendChild(ventana1);

      const ventana2 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      ventana2.setAttribute('x', '18');
      ventana2.setAttribute('y', '20');
      ventana2.setAttribute('width', '6');
      ventana2.setAttribute('height', '8');
      ventana2.setAttribute('rx', '1');
      ventana2.setAttribute('fill', '#87CEEB');
      svg.appendChild(ventana2);

      // Ventanas traseras
      const ventana3 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      ventana3.setAttribute('x', '26');
      ventana3.setAttribute('y', '20');
      ventana3.setAttribute('width', '6');
      ventana3.setAttribute('height', '8');
      ventana3.setAttribute('rx', '1');
      ventana3.setAttribute('fill', '#87CEEB');
      svg.appendChild(ventana3);

      const ventana4 = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      ventana4.setAttribute('x', '34');
      ventana4.setAttribute('y', '20');
      ventana4.setAttribute('width', '4');
      ventana4.setAttribute('height', '8');
      ventana4.setAttribute('rx', '1');
      ventana4.setAttribute('fill', '#87CEEB');
      svg.appendChild(ventana4);

      // Ruedas
      const rueda1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      rueda1.setAttribute('cx', '14');
      rueda1.setAttribute('cy', '40');
      rueda1.setAttribute('r', '4');
      rueda1.setAttribute('fill', '#333');
      svg.appendChild(rueda1);

      const rueda2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      rueda2.setAttribute('cx', '34');
      rueda2.setAttribute('cy', '40');
      rueda2.setAttribute('r', '4');
      rueda2.setAttribute('fill', '#333');
      svg.appendChild(rueda2);

      // Detalles de las ruedas
      const detalleRueda1 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      detalleRueda1.setAttribute('cx', '14');
      detalleRueda1.setAttribute('cy', '40');
      detalleRueda1.setAttribute('r', '2');
      detalleRueda1.setAttribute('fill', '#666');
      svg.appendChild(detalleRueda1);

      const detalleRueda2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      detalleRueda2.setAttribute('cx', '34');
      detalleRueda2.setAttribute('cy', '40');
      detalleRueda2.setAttribute('r', '2');
      detalleRueda2.setAttribute('fill', '#666');
      svg.appendChild(detalleRueda2);

      el.appendChild(svg);

      // Crear y agregar marcador
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([locationToUse.longitude, locationToUse.latitude])
        .setPopup(
          new mapboxgl.Popup({ offset: 25, closeButton: true })
            .setHTML(`<div style="font-weight: 600; color: #127067; padding: 4px;">${direccion || 'Mi ubicación'}</div>`)
        )
        .addTo(map.current);

      markerRef.current = marker;

      // Centrar el mapa en la ubicación (solo la primera vez o cuando cambia)
      const zoomLevel = 16;
      map.current.flyTo({
        center: [locationToUse.longitude, locationToUse.latitude],
        zoom: zoomLevel,
        pitch: 0,
        bearing: 0,
        duration: 1500,
        essential: true
      });
    } else if (simulatedPath && simulatedPath.length > 0) {
      // Si no hay ubicación real, mostrar path simulado
      simulatedPath.forEach(point => {
        new mapboxgl.Marker({ color: '#ff6b6b' })
          .setLngLat([point.longitude, point.latitude])
          .addTo(map.current!);
      });
    }
  }, [userLocation, driverLocation, direccion, simulatedPath]);

  // Efecto para mostrar la ruta con múltiples destinos
  useEffect(() => {
    if (!map.current || !route || !route.waypoints || route.waypoints.length === 0) {
      // Limpiar ruta anterior si no hay nueva ruta
      if (map.current && routeLayerRef.current) {
        if (map.current.getLayer(routeLayerRef.current)) {
          map.current.removeLayer(routeLayerRef.current);
        }
        if (map.current.getSource(routeLayerRef.current)) {
          map.current.removeSource(routeLayerRef.current);
        }
        routeLayerRef.current = null;
      }
      // Limpiar marcadores de destino
      routeMarkersRef.current.forEach(marker => marker.remove());
      routeMarkersRef.current = [];
      // Resetear el ref cuando no hay ruta
      rutaAnimadaRef.current = null;
      return;
    }

    // Crear un identificador único para esta ruta basado en los waypoints
    const rutaId = route.waypoints.map(w => `${w.coordinates.latitude},${w.coordinates.longitude}`).join('|');
    const esRutaNueva = rutaAnimadaRef.current !== rutaId;

    // Limpiar marcadores anteriores
    routeMarkersRef.current.forEach(marker => marker.remove());
    routeMarkersRef.current = [];

    // Limpiar capa de ruta anterior
    if (routeLayerRef.current) {
      if (map.current.getLayer(routeLayerRef.current)) {
        map.current.removeLayer(routeLayerRef.current);
      }
      if (map.current.getSource(routeLayerRef.current)) {
        map.current.removeSource(routeLayerRef.current);
      }
    }

    // Agregar marcadores para cada destino
    route.waypoints.forEach((waypoint, index) => {
      const el = document.createElement('div');
      el.className = 'route-waypoint-marker';
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#127067';
      el.style.border = '3px solid #fff';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = '#fff';
      el.style.fontWeight = 'bold';
      el.style.fontSize = '14px';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      el.textContent = (index + 1).toString();

      if (map.current) {
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([waypoint.coordinates.longitude, waypoint.coordinates.latitude])
          .setPopup(
            new mapboxgl.Popup({ offset: 25, closeButton: true })
              .setHTML(`<div style="font-weight: 600; color: #127067; padding: 4px;">${waypoint.name}</div>`)
          )
          .addTo(map.current);
        
        routeMarkersRef.current.push(marker);
      }

    });

    // Agregar línea de ruta si hay geometría
    if (route.routeGeometry) {
      const sourceId = 'route-source';
      const layerId = 'route-layer';

      routeLayerRef.current = layerId;

      // Asegurarse de que routeGeometry esté en el formato correcto para Mapbox
      let geometryData = route.routeGeometry;
      
      // Si es un Feature, usar directamente; si es solo geometry, convertirlo a Feature
      if (geometryData.type === 'Feature') {
        // Ya es un Feature, usar directamente
      } else if (geometryData.type === 'LineString') {
        // Es solo geometry, convertirlo a Feature
        geometryData = {
          type: 'Feature',
          geometry: geometryData,
          properties: {}
        };
      }

      if (!map.current.getSource(sourceId)) {
        map.current.addSource(sourceId, {
          type: 'geojson',
          data: geometryData,
        });
      } else {
        (map.current.getSource(sourceId) as mapboxgl.GeoJSONSource).setData(geometryData);
      }

      if (!map.current.getLayer(layerId)) {
        map.current.addLayer({
          id: layerId,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#1dbb7f', // Verde como en la imagen del conductor
            'line-width': 5,
            'line-opacity': 1,
          },
        });
      }

      // Solo animar si es una ruta nueva (primera vez que se genera)
      if (esRutaNueva && route.waypoints.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        
        // Incluir todos los waypoints en los bounds
        route.waypoints.forEach(waypoint => {
          bounds.extend([waypoint.coordinates.longitude, waypoint.coordinates.latitude]);
        });
        
        // Si hay ubicación del conductor, incluirla también en los bounds
        if (driverLocation || userLocation) {
          const locationToUse = driverLocation || userLocation;
          if (locationToUse) {
            bounds.extend([locationToUse.longitude, locationToUse.latitude]);
          }
        }
        
        // Marcar esta ruta como ya animada
        rutaAnimadaRef.current = rutaId;
        
        // Primero ajustar para mostrar toda la ruta
        map.current.fitBounds(bounds, {
          padding: { top: 50, bottom: 50, left: 50, right: 50 },
          maxZoom: 15,
          duration: 2000,
        });
        
        // Después de mostrar la ruta completa, centrar en el vehículo
        if (driverLocation || userLocation) {
          const locationToUse = driverLocation || userLocation;
          if (locationToUse) {
            setTimeout(() => {
              if (map.current) {
                map.current.flyTo({
                  center: [locationToUse.longitude, locationToUse.latitude],
                  zoom: 16,
                  pitch: 0,
                  bearing: 0,
                  duration: 1500,
                  essential: true
                });
              }
            }, 2500); // Esperar 2.5 segundos después de fitBounds
          }
        }
      } else if (!esRutaNueva && (driverLocation || userLocation)) {
        // Si la ruta ya fue animada, solo centrar en el vehículo sin animación amplia
        const locationToUse = driverLocation || userLocation;
        if (locationToUse && map.current) {
          map.current.flyTo({
            center: [locationToUse.longitude, locationToUse.latitude],
            zoom: 16,
            pitch: 0,
            bearing: 0,
            duration: 1000,
            essential: true
          });
        }
      }
    }
  }, [route, driverLocation, userLocation]);

  if (!tokenToUse && !accessToken) {
    return (
      <div style={styles.errorContainer}>
        <p style={styles.errorText}>Error: Se requiere un token de Mapbox.</p>
        <p style={styles.errorSubtext}>Por favor, configura EXPO_PUBLIC_MAPBOX_TOKEN en el archivo .env</p>
      </div>
    );
  }

  // Función mejorada para centrar la ubicación
  const centrarUbicacion = async () => {
    if (!map.current) return;

    let locationToUse = userLocation || driverLocation;

    // Si no hay ubicación disponible, intentar obtenerla
    if (!locationToUse) {
      try {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const coords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              };
              setUserLocation(coords);
              centrarMapaEnCoordenadas(coords);
            },
            (error) => {
              console.error('Error al obtener ubicación:', error);
              // En web, solo mostrar en consola
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            }
          );
        }
      } catch (error) {
        console.error('Error al obtener ubicación:', error);
      }
      return;
    }

    centrarMapaEnCoordenadas(locationToUse);
  };

  const centrarMapaEnCoordenadas = (coords: { latitude: number; longitude: number }) => {
    if (!map.current) return;

    // Actualizar el marcador si existe
    if (markerRef.current) {
      markerRef.current.setLngLat([coords.longitude, coords.latitude]);
    }

    const zoomLevel = 16;
    map.current.flyTo({
      center: [coords.longitude, coords.latitude],
      zoom: zoomLevel,
      pitch: 0,
      bearing: 0,
      duration: 800,
      essential: true,
    });
  };

  // Obtener ubicación actual si no hay driverLocation
  useEffect(() => {
    if (!driverLocation && !userLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          };
          setUserLocation(coords);
        },
        (error) => {
          console.log('No se pudo obtener la ubicación:', error);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    }
  }, [driverLocation]);

  return (
    <div style={styles.mapWrapper}>
      <div ref={mapContainer} style={styles.mapContainer} />
      {direccion && (
        <div style={styles.addressDisplay}>
          <strong>{direccion}</strong>
        </div>
      )}
      {/* Cuadro de información de ruta (tiempo y distancia) */}
      {route && route.distancia && route.tiempoEstimado && (
        <div style={styles.routeInfoBox}>
          <div style={styles.routeInfoContent}>
            <span style={styles.routeInfoText}>
              {formatTiempo(route.tiempoEstimado)} · {route.distancia} km
            </span>
          </div>
        </div>
      )}
      {/* Botón de centrar - siempre visible si hay ubicación disponible */}
      {(userLocation || driverLocation) && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            centrarUbicacion();
          }}
          style={styles.centerButton}
          title="Centrar en mi ubicación"
          aria-label="Centrar mapa en ubicación actual"
          type="button"
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#e0e0e0';
            e.currentTarget.style.color = '#333';
            e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#f5f5f5';
            e.currentTarget.style.color = '#666';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ pointerEvents: 'none' }}
          >
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <path
              d="M12 2V6M12 18V22M2 12H6M18 12H22"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

const styles = {
  mapWrapper: {
    height: '100%',
    width: '100%',
    position: 'relative' as const,
    borderRadius: '15px',
    overflow: 'hidden',
    border: '2px solid #000',
  },
  mapContainer: {
    height: '100%',
    width: '100%',
  },
  addressDisplay: {
    position: 'absolute' as const,
    top: '10px',
    left: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '14px',
    color: '#127067',
    zIndex: 1000,
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    maxWidth: '80%',
  },
  routeInfoBox: {
    position: 'absolute' as const,
    bottom: '20px',
    left: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: '10px',
    padding: '14px 18px',
    zIndex: 1000,
    boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
    minWidth: '150px',
  },
  routeInfoContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeInfoText: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
    letterSpacing: '0.3px',
  },
  errorContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    backgroundColor: '#f8d7da',
    height: '100%',
    borderRadius: '15px',
  },
  errorText: {
    fontSize: '16px',
    color: '#721c24',
    marginBottom: '8px',
    textAlign: 'center' as const,
  },
  errorSubtext: {
    fontSize: '14px',
    color: '#721c24',
    opacity: 0.8,
    textAlign: 'center' as const,
  },
  centerButton: {
    position: 'absolute' as const,
    bottom: '20px',
    right: '20px',
    width: '48px',
    height: '48px',
    backgroundColor: '#f5f5f5',
    border: 'none',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    transition: 'all 0.3s ease',
    padding: '0',
    outline: 'none',
    color: '#666',
  },
};