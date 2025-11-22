import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import { collection, query, where, getDocs, getDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore';

import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';

const ENCRYPTION_SALT = 'CONDUCTOR_DOC_V1';

type FotoSeleccionada = {
  base64: string;
  mimeType: string;
  previewUri: string;
  name?: string;
};

export default function AgregarDocumentosConductorScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [rutUsuario, setRutUsuario] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [carnetFrontal, setCarnetFrontal] = useState<FotoSeleccionada | null>(null);
  const [carnetReverso, setCarnetReverso] = useState<FotoSeleccionada | null>(null);
  const [licenciaFrontal, setLicenciaFrontal] = useState<FotoSeleccionada | null>(null);
  const [licenciaReverso, setLicenciaReverso] = useState<FotoSeleccionada | null>(null);
  const [loading, setLoading] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [estaVerificado, setEstaVerificado] = useState(false);

  const cargarDocumentos = React.useCallback(async () => {
    try {
      const rut = await AsyncStorage.getItem('rutUsuario');
      if (!rut) {
        Alert.alert('Error', 'No se encontró el RUT del usuario.');
        router.back();
        return;
      }
      setRutUsuario(rut);

      // Buscar el documento del usuario en la colección usuarios
      const usuariosRef = collection(db, 'usuarios');
      const q = query(usuariosRef, where('rut', '==', rut));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        Alert.alert('Error', 'No se encontró el usuario en la base de datos.');
        router.back();
        return;
      }

      const usuarioDoc = snapshot.docs[0];
      const usuarioId = usuarioDoc.id;
      setUserId(usuarioId);

      const usuarioData = usuarioDoc.data();

      // Verificar si todos los documentos están presentes y actualizar estado de verificación
      const tieneCarnetFrontal = !!usuarioData.documentos?.carnetIdentidad?.frontal?.contenidoCifrado;
      const tieneCarnetReverso = !!usuarioData.documentos?.carnetIdentidad?.reverso?.contenidoCifrado;
      const tieneLicenciaFrontal = !!usuarioData.documentos?.licenciaConducir?.frontal?.contenidoCifrado;
      const tieneLicenciaReverso = !!usuarioData.documentos?.licenciaConducir?.reverso?.contenidoCifrado;
      
      const tieneTodosDocumentos = tieneCarnetFrontal && tieneCarnetReverso && tieneLicenciaFrontal && tieneLicenciaReverso;
      const verificado = usuarioData.verificado === true;
      
      // Actualizar estado de verificación
      setEstaVerificado(verificado && tieneTodosDocumentos);
      
      console.log('🔍 Verificación de documentos:', {
        tieneCarnetFrontal,
        tieneCarnetReverso,
        tieneLicenciaFrontal,
        tieneLicenciaReverso,
        tieneTodosDocumentos,
        verificadoActual: estaVerificado,
        necesitaActualizar: tieneTodosDocumentos && !estaVerificado,
      });
      
      // Si tiene todos los documentos pero no está verificado, actualizar estado INMEDIATAMENTE
      if (tieneTodosDocumentos && !estaVerificado) {
        console.log('📋 Todos los documentos están presentes, actualizando estado a verificado...');
        try {
          const usuarioRef = doc(db, 'usuarios', usuarioId);
          await updateDoc(usuarioRef, {
            verificado: true,
            documentosActualizadosEn: serverTimestamp(),
          });
          console.log('✅ Estado actualizado a verificado automáticamente');
          
          // Verificar que se guardó correctamente
          const usuarioVerificadoSnap = await getDoc(usuarioRef);
          if (usuarioVerificadoSnap.exists()) {
            const datosActualizados = usuarioVerificadoSnap.data();
            console.log('✅ Confirmación: Estado guardado como:', datosActualizados.verificado);
            if (datosActualizados.verificado === true) {
              setEstaVerificado(true);
              Alert.alert(
                'Estado actualizado',
                'Todos tus documentos están completos. Tu cuenta ha sido verificada automáticamente.'
              );
            }
          }
        } catch (error) {
          console.error('❌ Error al actualizar estado de verificación:', error);
          Alert.alert(
            'Advertencia', 
            'Los documentos están guardados pero no se pudo actualizar el estado de verificación automáticamente. Intenta recargar la página.'
          );
        }
      } else if (!tieneTodosDocumentos && estaVerificado) {
        // Si no tiene todos los documentos pero está marcado como verificado, corregir el estado
        console.log('⚠️ Usuario marcado como verificado pero faltan documentos, corrigiendo estado...');
        try {
          const usuarioRef = doc(db, 'usuarios', usuarioId);
          await updateDoc(usuarioRef, {
            verificado: false,
            documentosActualizadosEn: serverTimestamp(),
          });
          console.log('✅ Estado corregido a no verificado');
        } catch (error) {
          console.error('❌ Error al corregir estado de verificación:', error);
        }
      } else if (tieneTodosDocumentos && estaVerificado) {
        console.log('✅ Usuario tiene todos los documentos y está verificado correctamente');
      } else {
        console.log('❌ Usuario NO verificado - Faltan documentos');
      }

      // Cargar imágenes existentes si están cifradas en el documento del usuario
      if (usuarioData.documentos?.carnetIdentidad?.frontal?.contenidoCifrado) {
        // Método antiguo: descifrar contenido cifrado
        try {
          const clave = `${rut}-${ENCRYPTION_SALT}`;
          const bytes = CryptoJS.AES.decrypt(usuarioData.documentos.carnetIdentidad.frontal.contenidoCifrado, clave);
          const base64 = bytes.toString(CryptoJS.enc.Utf8);
          if (base64) {
            setCarnetFrontal({
              base64,
              mimeType: usuarioData.documentos.carnetIdentidad.frontal.mimeType || 'image/jpeg',
              previewUri: `data:${usuarioData.documentos.carnetIdentidad.frontal.mimeType || 'image/jpeg'};base64,${base64}`,
              name: usuarioData.documentos.carnetIdentidad.frontal.nombreArchivo || '',
            });
          }
        } catch (error) {
          console.warn('No se pudo descifrar carnet frontal:', error);
        }
      }

      if (usuarioData.documentos?.carnetIdentidad?.reverso?.contenidoCifrado) {
        try {
          const clave = `${rut}-${ENCRYPTION_SALT}`;
          const bytes = CryptoJS.AES.decrypt(usuarioData.documentos.carnetIdentidad.reverso.contenidoCifrado, clave);
          const base64 = bytes.toString(CryptoJS.enc.Utf8);
          if (base64) {
            setCarnetReverso({
              base64,
              mimeType: usuarioData.documentos.carnetIdentidad.reverso.mimeType || 'image/jpeg',
              previewUri: `data:${usuarioData.documentos.carnetIdentidad.reverso.mimeType || 'image/jpeg'};base64,${base64}`,
              name: usuarioData.documentos.carnetIdentidad.reverso.nombreArchivo || '',
            });
          }
        } catch (error) {
          console.warn('No se pudo descifrar carnet reverso:', error);
        }
      }

      if (usuarioData.documentos?.licenciaConducir?.frontal?.contenidoCifrado) {
        try {
          const clave = `${rut}-${ENCRYPTION_SALT}`;
          const bytes = CryptoJS.AES.decrypt(usuarioData.documentos.licenciaConducir.frontal.contenidoCifrado, clave);
          const base64 = bytes.toString(CryptoJS.enc.Utf8);
          if (base64) {
            setLicenciaFrontal({
              base64,
              mimeType: usuarioData.documentos.licenciaConducir.frontal.mimeType || 'image/jpeg',
              previewUri: `data:${usuarioData.documentos.licenciaConducir.frontal.mimeType || 'image/jpeg'};base64,${base64}`,
              name: usuarioData.documentos.licenciaConducir.frontal.nombreArchivo || '',
            });
          }
        } catch (error) {
          console.warn('No se pudo descifrar licencia frontal:', error);
        }
      }

      if (usuarioData.documentos?.licenciaConducir?.reverso?.contenidoCifrado) {
        try {
          const clave = `${rut}-${ENCRYPTION_SALT}`;
          const bytes = CryptoJS.AES.decrypt(usuarioData.documentos.licenciaConducir.reverso.contenidoCifrado, clave);
          const base64 = bytes.toString(CryptoJS.enc.Utf8);
          if (base64) {
            setLicenciaReverso({
              base64,
              mimeType: usuarioData.documentos.licenciaConducir.reverso.mimeType || 'image/jpeg',
              previewUri: `data:${usuarioData.documentos.licenciaConducir.reverso.mimeType || 'image/jpeg'};base64,${base64}`,
              name: usuarioData.documentos.licenciaConducir.reverso.nombreArchivo || '',
            });
          }
        } catch (error) {
          console.warn('No se pudo descifrar licencia reverso:', error);
        }
      }
    } catch (error) {
      console.error('Error al cargar documentos:', error);
      Alert.alert('Error', 'No se pudieron cargar los documentos existentes.');
    } finally {
      setCargando(false);
    }
  }, [router]);

  React.useEffect(() => {
    cargarDocumentos();
  }, [cargarDocumentos]);

  const seleccionarImagen = async (tipo: 'carnetFrontal' | 'carnetReverso' | 'licenciaFrontal' | 'licenciaReverso') => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert('Permiso requerido', 'Otorga acceso a tu galería para cargar la imagen.');
        return;
      }

      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, // Mantener MediaTypeOptions por compatibilidad
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.3, // Calidad muy baja para reducir tamaño significativamente
        base64: true,
      });

      if (resultado.canceled || !resultado.assets?.length) {
        return;
      }

      const asset = resultado.assets[0];
      if (!asset.base64) {
        Alert.alert('Error', 'No se pudo leer la imagen seleccionada.');
        return;
      }

      const mimeType = asset.mimeType || 'image/jpeg';
      const previewUri = `data:${mimeType};base64,${asset.base64}`;
      const seleccionada: FotoSeleccionada = {
        base64: asset.base64,
        mimeType,
        previewUri,
        name: asset.fileName || asset.uri?.split('/')?.pop() || '',
      };

      switch (tipo) {
        case 'carnetFrontal':
          setCarnetFrontal(seleccionada);
          break;
        case 'carnetReverso':
          setCarnetReverso(seleccionada);
          break;
        case 'licenciaFrontal':
          setLicenciaFrontal(seleccionada);
          break;
        case 'licenciaReverso':
          setLicenciaReverso(seleccionada);
          break;
      }
    } catch (error) {
      console.error('Error al seleccionar imagen:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen. Intenta nuevamente.');
    }
  };

  // Comprimir imagen adicionalmente antes de cifrar (para reducir tamaño)
  const comprimirImagenAdicional = async (foto: FotoSeleccionada): Promise<string> => {
    try {
      // En web, usar canvas para comprimir más
      if (typeof document !== 'undefined' && typeof window !== 'undefined') {
        return new Promise((resolve, reject) => {
          const img = document.createElement('img') as HTMLImageElement;
          img.onload = () => {
            try {
              // Redimensionar a máximo 600px (más pequeño que antes)
              const maxWidth = 600;
              const maxHeight = 600;
              let width = img.width;
              let height = img.height;

              if (width > maxWidth || height > maxHeight) {
                if (width > height) {
                  height = (height * maxWidth) / width;
                  width = maxWidth;
                } else {
                  width = (width * maxHeight) / height;
                  height = maxHeight;
                }
              }

              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              
              if (!ctx) {
                reject(new Error('No se pudo obtener contexto del canvas'));
                return;
              }

              ctx.drawImage(img, 0, 0, width, height);
              
              // Comprimir a JPEG con calidad 0.4 (muy baja para reducir tamaño)
              const compressedBase64 = canvas.toDataURL('image/jpeg', 0.4).split(',')[1];
              resolve(compressedBase64);
            } catch (error) {
              reject(error);
            }
          };
          img.onerror = reject;
          img.src = foto.previewUri;
        });
      } else {
        // En React Native, usar la imagen original (ya viene comprimida por ImagePicker)
        return foto.base64;
      }
    } catch (error) {
      console.warn('Error al comprimir imagen adicionalmente, usando original:', error);
      return foto.base64;
    }
  };

  // Cifrar imagen (con compresión adicional si es posible)
  const cifrarImagen = async (foto: FotoSeleccionada, rut: string): Promise<string> => {
    // Comprimir primero si es posible
    const base64Comprimido = await comprimirImagenAdicional(foto);
    const clave = `${rut}-${ENCRYPTION_SALT}`;
    return CryptoJS.AES.encrypt(base64Comprimido, clave).toString();
  };

  const manejarGuardar = async () => {
    if (!rutUsuario || !userId) {
      Alert.alert('Error', 'No se encontró el RUT del usuario o el ID del documento.');
      return;
    }

    if (!carnetFrontal || !carnetReverso || !licenciaFrontal || !licenciaReverso) {
      Alert.alert(
        'Documentos incompletos',
        'Debes cargar todas las imágenes requeridas:\n\n• Carnet de Identidad - Frontal\n• Carnet de Identidad - Reverso\n• Licencia de Conducir - Frontal\n• Licencia de Conducir - Reverso'
      );
      return;
    }

    try {
      setLoading(true);

      console.log('🔐 Comprimiendo y cifrando imágenes...');

      // Comprimir y cifrar todas las imágenes (con compresión adicional)
      const [cifradaCarnetFrontal, cifradaCarnetReverso, cifradaLicenciaFrontal, cifradaLicenciaReverso] = await Promise.all([
        cifrarImagen(carnetFrontal, rutUsuario),
        cifrarImagen(carnetReverso, rutUsuario),
        cifrarImagen(licenciaFrontal, rutUsuario),
        cifrarImagen(licenciaReverso, rutUsuario),
      ]);

      // Verificar tamaño aproximado antes de guardar
      const tamañoTotal = cifradaCarnetFrontal.length + cifradaCarnetReverso.length + 
                          cifradaLicenciaFrontal.length + cifradaLicenciaReverso.length;
      console.log(`📊 Tamaño aproximado del documento cifrado: ${(tamañoTotal / 1024).toFixed(2)} KB`);
      
      if (tamañoTotal > 900000) { // ~900 KB (dejando margen para otros campos)
        Alert.alert(
          'Advertencia',
          'Las imágenes son muy grandes. Se intentará guardar con máxima compresión, pero si falla, considera usar imágenes de menor resolución.'
        );
      }

      console.log('✅ Imágenes cifradas correctamente');

      // Guardar documentos cifrados directamente en el registro del usuario
      const usuarioRef = doc(db, 'usuarios', userId);
      
      const documentosData = {
        documentos: {
          carnetIdentidad: {
            frontal: {
              contenidoCifrado: cifradaCarnetFrontal,
              mimeType: 'image/jpeg', // Siempre JPEG después de compresión
              nombreArchivo: carnetFrontal.name || 'carnet-frontal.jpg',
            },
            reverso: {
              contenidoCifrado: cifradaCarnetReverso,
              mimeType: 'image/jpeg',
              nombreArchivo: carnetReverso.name || 'carnet-reverso.jpg',
            },
          },
          licenciaConducir: {
            frontal: {
              contenidoCifrado: cifradaLicenciaFrontal,
              mimeType: 'image/jpeg',
              nombreArchivo: licenciaFrontal.name || 'licencia-frontal.jpg',
            },
            reverso: {
              contenidoCifrado: cifradaLicenciaReverso,
              mimeType: 'image/jpeg',
              nombreArchivo: licenciaReverso.name || 'licencia-reverso.jpg',
            },
          },
        },
        verificado: true, // Cambiar estado a verificado cuando se guardan todos los documentos
        documentosActualizadosEn: serverTimestamp(),
      };

      await updateDoc(usuarioRef, documentosData);

      console.log('✅ Documentos guardados y usuario verificado');

      // Verificar inmediatamente que el estado se guardó correctamente
      const usuarioVerificadoRef = doc(db, 'usuarios', userId);
      const usuarioVerificadoSnap = await getDoc(usuarioVerificadoRef);
      
      if (usuarioVerificadoSnap.exists()) {
        const datosVerificados = usuarioVerificadoSnap.data();
        console.log('✅ Verificación post-guardado:', {
          verificado: datosVerificados.verificado,
          tieneDocumentos: !!datosVerificados.documentos,
        });
        
        if (datosVerificados.verificado !== true) {
          console.warn('⚠️ El estado no se actualizó correctamente, reintentando...');
          await updateDoc(usuarioVerificadoRef, { verificado: true });
        } else {
          setEstaVerificado(true);
        }
      }

      // Forzar refresh de la página para actualizar el estado
      setRefreshing(true);
      setLoading(false);

      // Actualizar estado de verificación inmediatamente
      setEstaVerificado(true);
      
      // Recargar documentos después de un breve delay para sincronizar con la BD
      setTimeout(async () => {
        setRefreshing(false);
        // Recargar para verificar el estado y mostrar las imágenes
        await cargarDocumentos();
      }, 1000);

      Alert.alert(
        'Éxito', 
        'Documentos guardados correctamente. Tu cuenta ha sido verificada.',
        [{ text: 'OK', onPress: () => {} }]
      );
    } catch (error) {
      console.error('Error al guardar documentos:', error);
      Alert.alert('Error', 'No se pudieron guardar los documentos.');
    } finally {
      setLoading(false);
    }
  };

  if (cargando) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#127067" />
        <Text style={styles.loadingText}>Cargando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Documentación para Verificación</Text>
        <Text style={styles.subtitle}>Sube las imágenes de tus documentos de identificación</Text>

        <View style={styles.avatarContainer}>
          <Image
            source={require('@/assets/images/user_icon.png')}
            style={styles.avatar}
            contentFit="cover"
          />
        </View>

        {estaVerificado ? (
          <View style={styles.verifiedBox}>
            <Ionicons name="checkmark-circle" size={20} color="#127067" style={styles.verifiedIcon} />
            <Text style={styles.verifiedText}>
              ✅ Estás verificado. Todos tus documentos están completos y tu cuenta está activa para los demás usuarios.
            </Text>
          </View>
        ) : (
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={20} color="#d32f2f" style={styles.warningIcon} />
            <Text style={styles.warningText}>
              Si no subes todos los documentos requeridos, no serás verificado para los demás usuarios.
            </Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Carnet de Identidad</Text>
          
          <Pressable 
            style={styles.uploadBox} 
            onPress={() => seleccionarImagen('carnetFrontal')}
          >
            {carnetFrontal?.previewUri ? (
              <Image 
                source={{ uri: carnetFrontal.previewUri }} 
                style={styles.uploadPreview} 
                contentFit="cover" 
              />
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Ionicons name="camera" size={32} color="#127067" />
                <Text style={styles.uploadText}>Cargar Carnet de Identidad - Frontal</Text>
              </View>
            )}
          </Pressable>

          <Pressable 
            style={styles.uploadBox} 
            onPress={() => seleccionarImagen('carnetReverso')}
          >
            {carnetReverso?.previewUri ? (
              <Image 
                source={{ uri: carnetReverso.previewUri }} 
                style={styles.uploadPreview} 
                contentFit="cover" 
              />
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Ionicons name="camera" size={32} color="#127067" />
                <Text style={styles.uploadText}>Cargar Carnet de Identidad - Reverso</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Licencia de Conducir</Text>
          
          <Pressable 
            style={styles.uploadBox} 
            onPress={() => seleccionarImagen('licenciaFrontal')}
          >
            {licenciaFrontal?.previewUri ? (
              <Image 
                source={{ uri: licenciaFrontal.previewUri }} 
                style={styles.uploadPreview} 
                contentFit="cover" 
              />
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Ionicons name="camera" size={32} color="#127067" />
                <Text style={styles.uploadText}>Cargar Licencia de Conducir - Frontal</Text>
              </View>
            )}
          </Pressable>

          <Pressable 
            style={styles.uploadBox} 
            onPress={() => seleccionarImagen('licenciaReverso')}
          >
            {licenciaReverso?.previewUri ? (
              <Image 
                source={{ uri: licenciaReverso.previewUri }} 
                style={styles.uploadPreview} 
                contentFit="cover" 
              />
            ) : (
              <View style={styles.uploadPlaceholder}>
                <Ionicons name="camera" size={32} color="#127067" />
                <Text style={styles.uploadText}>Cargar Licencia de Conducir - Reverso</Text>
              </View>
            )}
          </Pressable>
        </View>

        <Pressable
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={manejarGuardar}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.saveText}>Guardar Documentos</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F8',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7F8',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
    padding: 5,
    backgroundColor: '#fff',
    borderRadius: 20,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#127067',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    backgroundColor: '#e6e6e6',
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 48,
    height: 48,
  },
  verifiedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F7F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#127067',
  },
  verifiedIcon: {
    marginRight: 10,
  },
  verifiedText: {
    flex: 1,
    fontSize: 14,
    color: '#127067',
    fontWeight: '500',
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF9C4',
    borderLeftWidth: 4,
    borderLeftColor: '#d32f2f',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    width: '100%',
    alignItems: 'flex-start',
  },
  warningIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
  section: {
    width: '100%',
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  uploadBox: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#127067',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#F8FBFB',
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadText: {
    color: '#127067',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
  },
  uploadPreview: {
    width: '100%',
    height: 160,
    borderRadius: 12,
  },
  saveButton: {
    backgroundColor: '#127067',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 22,
    marginTop: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});

