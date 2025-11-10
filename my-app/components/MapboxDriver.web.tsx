import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@/firebaseConfig';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';

type LatLng = { latitude: number; longitude: number };

interface Props {
  accessToken?: string;
  driverLocation?: LatLng;
  simulatedPath?: LatLng[];
}

export default function MapboxDriver({ accessToken, driverLocation, simulatedPath }: Props) {
  const mapContainer = useRef(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
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
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [initialLocation.lng, initialLocation.lat],
        zoom: 14
      });
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
      // Crear marcador más visible y grande
      const el = document.createElement('div');
      el.className = 'custom-location-marker';
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#127067';
      el.style.border = '4px solid #fff';
      el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.zIndex = '1000';

      // Punto central blanco
      const puntoCentral = document.createElement('div');
      puntoCentral.style.width = '12px';
      puntoCentral.style.height = '12px';
      puntoCentral.style.borderRadius = '50%';
      puntoCentral.style.backgroundColor = '#fff';
      el.appendChild(puntoCentral);

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
            e.currentTarget.style.backgroundColor = '#127067';
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.transform = 'scale(1.1)';
            e.currentTarget.style.boxShadow = '0 6px 24px rgba(18, 112, 103, 0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#fff';
            e.currentTarget.style.color = '#127067';
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ pointerEvents: 'none' }}
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" fill="none" />
            <circle cx="12" cy="12" r="4" fill="currentColor" />
            <path
              d="M12 1V5M12 19V23M1 12H5M19 12H23"
              stroke="currentColor"
              strokeWidth="2.5"
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
    overflow: 'hidden'
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
    width: '60px',
    height: '60px',
    backgroundColor: '#fff',
    border: '3px solid #127067',
    borderRadius: '50%',
    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    transition: 'all 0.3s ease',
    padding: '0',
    outline: 'none',
    color: '#127067',
  },
};