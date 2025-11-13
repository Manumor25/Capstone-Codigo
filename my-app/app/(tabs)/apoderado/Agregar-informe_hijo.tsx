import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where, addDoc, limit } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

// Lista de países latinoamericanos con Chile primero
const PAISES_LATINOAMERICANOS = [
  'Chilena',
  'Argentina',
  'Bolivia',
  'Brasil',
  'Colombia',
  'Costa Rica',
  'Cuba',
  'República Dominicana',
  'Ecuador',
  'El Salvador',
  'Guatemala',
  'Honduras',
  'México',
  'Nicaragua',
  'Panamá',
  'Paraguay',
  'Perú',
  'Puerto Rico',
  'Uruguay',
  'Venezuela',
];

// Lista de parentescos familiares
const PARENTESCOS_FAMILIARES = [
  'Padre',
  'Madre',
  'Tutor',
  'Abuelo/a',
  'Tío/a',
  'Hermano/a',
  'Primo/a',
  'Otro',
];

// Lista de tipos sanguíneos
const TIPOS_SANGUINEOS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
];

interface DatosHijoDraft {
  nombres: string;
  apellidos: string;
  rut: string;
  fechaNacimiento: string;
  edad: string;
  rutUsuario: string;
}

type FotoHijo = {
  base64: string;
  mimeType: string;
  previewUri: string;
  name?: string;
};

interface FichaMedica {
  // Datos del estudiante
  nombreCompleto: string;
  noAfiliacion: string;
  nacionalidad: string;
  genero: 'F' | 'M' | '';
  fechaNacimiento: string;
  edad: string;
  direccion: string;
  codigoPostal: string;
  localidad: string;
  telefonoCasa: string;
  celular: string;
  correoElectronico: string;
  
  // Datos padres/tutores
  padre1Nombre: string;
  padre1Telefono: string;
  padre1Parentesco: string;
  padre2Nombre: string;
  padre2Telefono: string;
  padre2Parentesco: string;
  
  // Información médica
  grupoSanguineo: string;
  telefonoEmergencias: string;
  
  // Condiciones médicas
  condiciones: {
    asma: boolean;
    enfermedadesRespiratorias: boolean;
    enfermedadesCardiacas: boolean;
    enfermedadesGastricas: boolean;
    hepatitis: boolean;
    anemias: boolean;
    hipertension: boolean;
    hipotension: boolean;
    diabetes: boolean;
    epilepsia: boolean;
    convulsiones: boolean;
    hernias: boolean;
    celiaquismo: boolean;
    dolorCabezaSevero: boolean;
    problemasPsiquiatricos: boolean;
    fracturasTraumatismos: boolean;
  };
  
  // Medicamentos
  tomaMedicamentos: 'SÍ' | 'NO' | '';
  medicamentos: string;
  
  // Alergias
  alergias: string;
  
  // Discapacidad
  tieneDiscapacidad: 'SÍ' | 'NO' | '';
  discapacidad: string;
}

export default function AgregarInformeHijoScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [datosHijo, setDatosHijo] = useState<DatosHijoDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [aprobado, setAprobado] = useState(false);
  const [modalExitoVisible, setModalExitoVisible] = useState(false);
  const [fotoHijo, setFotoHijo] = useState<FotoHijo | null>(null);

  const [fichaMedica, setFichaMedica] = useState<FichaMedica>({
    nombreCompleto: '',
    noAfiliacion: '',
    nacionalidad: '',
    genero: '',
    fechaNacimiento: '',
    edad: '',
    direccion: '',
    codigoPostal: '',
    localidad: '',
    telefonoCasa: '',
    celular: '',
    correoElectronico: '',
    padre1Nombre: '',
    padre1Telefono: '',
    padre1Parentesco: '',
    padre2Nombre: '',
    padre2Telefono: '',
    padre2Parentesco: '',
    grupoSanguineo: '',
    telefonoEmergencias: '',
    condiciones: {
      asma: false,
      enfermedadesRespiratorias: false,
      enfermedadesCardiacas: false,
      enfermedadesGastricas: false,
      hepatitis: false,
      anemias: false,
      hipertension: false,
      hipotension: false,
      diabetes: false,
      epilepsia: false,
      convulsiones: false,
      hernias: false,
      celiaquismo: false,
      dolorCabezaSevero: false,
      problemasPsiquiatricos: false,
      fracturasTraumatismos: false,
    },
    tomaMedicamentos: '',
    medicamentos: '',
    alergias: '',
    tieneDiscapacidad: '',
    discapacidad: '',
  });

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const hijoDraftRaw = await AsyncStorage.getItem('nuevoHijoData');
        if (!hijoDraftRaw) {
          Alert.alert('Faltan datos', 'Registra primero los datos del niño.');
          router.replace('/(tabs)/apoderado/Agregar-hijo');
          return;
        }

        const datos = JSON.parse(hijoDraftRaw);
        setDatosHijo(datos);
        
        // Prellenar datos del hijo
        setFichaMedica(prev => ({
          ...prev,
          nombreCompleto: `${datos.nombres} ${datos.apellidos}`,
          fechaNacimiento: datos.fechaNacimiento,
          edad: datos.edad,
        }));

        // Cargar foto guardada si existe
        const fotoRaw = await AsyncStorage.getItem('nuevoHijoFoto');
        if (fotoRaw) {
          try {
            const fotoParsed = JSON.parse(fotoRaw);
            if (fotoParsed && !fotoParsed.previewUri && fotoParsed.base64 && fotoParsed.mimeType) {
              fotoParsed.previewUri = `data:${fotoParsed.mimeType};base64,${fotoParsed.base64}`;
            }
            setFotoHijo(fotoParsed);
          } catch (error) {
            console.warn('Error al cargar foto guardada:', error);
          }
        }
      } catch (error) {
        console.error('Error al cargar datos:', error);
        Alert.alert('Error', 'No se pudieron cargar los datos previos.');
      }
    };

    cargarDatos();
  }, [router]);

  const actualizarCampo = (campo: keyof FichaMedica, valor: any) => {
    setFichaMedica(prev => ({ ...prev, [campo]: valor }));
  };

  const mostrarOpcionesFoto = () => {
    Alert.alert(
      'Seleccionar foto',
      '¿Cómo deseas agregar la foto?',
      [
        {
          text: 'Tomar foto',
          onPress: () => tomarFoto(),
        },
        {
          text: 'Galería',
          onPress: () => seleccionarDeGaleria(),
        },
        {
          text: 'Cancelar',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  const tomarFoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert('Permiso requerido', 'Otorga acceso a la cámara para tomar una foto.');
        return;
      }

      const resultado = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (resultado.canceled || !resultado.assets?.length) {
        return;
      }

      await procesarImagen(resultado.assets[0]);
    } catch (error) {
      console.error('Error al tomar foto:', error);
      Alert.alert('Error', 'No se pudo tomar la foto. Intenta nuevamente.');
    }
  };

  const seleccionarDeGaleria = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert('Permiso requerido', 'Otorga acceso a tu galería para cargar la imagen.');
        return;
      }

      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (resultado.canceled || !resultado.assets?.length) {
        return;
      }

      await procesarImagen(resultado.assets[0]);
    } catch (error) {
      console.error('Error al seleccionar imagen:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen. Intenta nuevamente.');
    }
  };

  const procesarImagen = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!asset.base64) {
      Alert.alert('Error', 'No se pudo leer la imagen seleccionada.');
      return;
    }

    const mimeType = asset.mimeType || 'image/jpeg';
    const previewUri = `data:${mimeType};base64,${asset.base64}`;
    const foto: FotoHijo = {
      base64: asset.base64,
      mimeType,
      previewUri,
      name: asset.fileName || asset.uri?.split('/')?.pop() || 'foto_hijo.jpg',
    };

    setFotoHijo(foto);
    await AsyncStorage.setItem('nuevoHijoFoto', JSON.stringify(foto));
  };

  const actualizarCondicion = (condicion: keyof FichaMedica['condiciones'], valor: boolean) => {
    setFichaMedica(prev => ({
      ...prev,
      condiciones: { ...prev.condiciones, [condicion]: valor },
    }));
  };

  const validarFormulario = (): boolean => {
    if (!fichaMedica.nombreCompleto.trim()) {
      Alert.alert('Error', 'Completa el nombre completo del estudiante.');
      return false;
    }
    if (!fichaMedica.fechaNacimiento.trim()) {
      Alert.alert('Error', 'Completa la fecha de nacimiento.');
      return false;
    }
    if (!fichaMedica.telefonoEmergencias.trim()) {
      Alert.alert('Error', 'Completa el teléfono de emergencias.');
      return false;
    }
    return true;
  };

  const manejarGuardar = () => {
    if (!validarFormulario()) return;
    
    if (!datosHijo) {
      Alert.alert('Error', 'No se encontraron los datos del niño.');
      return;
    }

    setModalVisible(true);
  };

  const confirmarGuardar = async () => {
    if (!aprobado) {
      Alert.alert('Atención', 'Debes aprobar que se guarde la información médica del niño.');
      return;
    }

    if (!datosHijo) {
      Alert.alert('Error', 'No se encontraron los datos del niño.');
      setModalVisible(false);
      return;
    }

    setModalVisible(false);

    try {
      setLoading(true);

      // Normalizar el rutUsuario para guardarlo de forma consistente (sin espacios)
      const rutUsuarioNormalizado = datosHijo.rutUsuario ? datosHijo.rutUsuario.trim() : '';

      // Cargar horario desde AsyncStorage
      let horarioAsistencia: any[] = [];
      try {
        const horarioRaw = await AsyncStorage.getItem('nuevoHijoHorario');
        if (horarioRaw) {
          const horarioParsed = JSON.parse(horarioRaw);
          if (Array.isArray(horarioParsed)) {
            // Filtrar solo los días que asisten y formatear correctamente
            horarioAsistencia = horarioParsed
              .filter((dia: any) => dia.asiste === true)
              .map((dia: any) => ({
                id: dia.id || dia.etiqueta?.toLowerCase() || '',
                etiqueta: dia.etiqueta || dia.id || '',
                asiste: true,
                horaEntrada: dia.horaEntrada || '',
                horaSalida: dia.horaSalida || '',
              }));
          }
        }
      } catch (error) {
        console.error('Error al cargar horario:', error);
      }

      const datosCompletos: any = {
        ...datosHijo,
        rutUsuario: rutUsuarioNormalizado, // Normalizar RUT sin espacios
        fichaMedica: {
          ...fichaMedica,
          fechaGuardado: new Date().toISOString(),
        },
        horarioAsistencia: horarioAsistencia, // Incluir horario
        actualizadoEn: serverTimestamp(),
      };

      // Agregar foto si existe
      if (fotoHijo) {
        datosCompletos.fotoHijo = {
          base64: fotoHijo.base64,
          mimeType: fotoHijo.mimeType,
          nombreArchivo: fotoHijo.name || 'foto_hijo.jpg',
        };
      }

      console.log('✅ Guardando hijo con rutUsuario normalizado:', {
        rutHijo: datosHijo.rut,
        rutUsuario: rutUsuarioNormalizado,
        tieneFoto: !!fotoHijo,
        tieneHorario: horarioAsistencia.length > 0,
      });

      await setDoc(doc(db, 'Hijos', datosHijo.rut), datosCompletos, { merge: true });

      // Verificar si el apoderado ya tiene un hijo inscrito en un furgón
      try {
        const listaPasajerosRef = collection(db, 'lista_pasajeros');
        const listaPasajerosQuery = query(
          listaPasajerosRef,
          where('rutApoderado', '==', rutUsuarioNormalizado),
          limit(1)
        );
        const listaPasajerosSnap = await getDocs(listaPasajerosQuery);

        if (!listaPasajerosSnap.empty) {
          const pasajeroData = listaPasajerosSnap.docs[0].data();
          const rutConductor = (pasajeroData.rutConductor || '').toString().trim();
          const patenteFurgon = (pasajeroData.patenteFurgon || '').toString().trim();
          const nombreHijoExistente = pasajeroData.nombreHijo || '';
          const idFurgon = pasajeroData.idFurgon || '';

          if (rutConductor && patenteFurgon) {
            // Normalizar RUT del conductor
            const normalizarRut = (rut: string): string => {
              return rut.replace(/[^0-9kK]/g, '').toUpperCase();
            };
            const rutConductorNormalizado = normalizarRut(rutConductor);

            // Obtener nombre del apoderado
            let nombreApoderado = '';
            try {
              const usuariosRef = collection(db, 'usuarios');
              const usuariosQuery = query(usuariosRef, where('rut', '==', rutUsuarioNormalizado), limit(1));
              const usuariosSnap = await getDocs(usuariosQuery);
              if (!usuariosSnap.empty) {
                const usuarioData = usuariosSnap.docs[0].data();
                nombreApoderado = `${usuarioData.nombres || ''} ${usuarioData.apellidos || ''}`.trim();
              }
            } catch (error) {
              console.error('Error al obtener nombre del apoderado:', error);
            }

            const nombreNuevoHijo = `${datosHijo.nombres} ${datosHijo.apellidos}`.trim();

            // Crear alerta para el conductor
            const alertaData = {
              tipoAlerta: 'AgregarHijo',
              descripcion: `${nombreApoderado || 'Un apoderado'} quiere agregar a ${nombreNuevoHijo} al furgón ${patenteFurgon}`,
              rutDestinatario: rutConductorNormalizado,
              rutDestinatarioOriginal: rutConductor,
              rutaDestino: '/chat-validacion',
              parametros: {
                rutPadre: rutUsuarioNormalizado,
                rutConductor: rutConductorNormalizado,
                rutConductorOriginal: rutConductor,
                rutHijo: datosHijo.rut,
                patenteFurgon: patenteFurgon,
                idFurgon: idFurgon,
                nombreHijo: nombreNuevoHijo,
                nombreApoderado: nombreApoderado,
                accion: 'agregar_hijo',
              },
              creadoEn: serverTimestamp(),
              leida: false,
              patenteFurgon: patenteFurgon,
            };

            await addDoc(collection(db, 'Alertas'), alertaData);
            console.log('✅ Alerta creada para el conductor:', {
              rutConductor: rutConductorNormalizado,
              patenteFurgon,
              nombreHijo: nombreNuevoHijo,
            });
          }
        }
      } catch (error) {
        console.error('Error al verificar inscripción o crear alerta:', error);
        // Continuar aunque falle la creación de la alerta
      }

      await AsyncStorage.multiRemove(['nuevoHijoData', 'nuevoHijoHorario', 'nuevoHijoFoto']);

      // Cerrar el modal de confirmación
      setModalVisible(false);

      // Mostrar modal de éxito
      setModalExitoVisible(true);

      // Después de 5 segundos, redirigir a la página principal
      setTimeout(() => {
        setModalExitoVisible(false);
        router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
      }, 5000);
    } catch (error) {
      console.error('Error al guardar la ficha médica:', error);
      Alert.alert('Error', 'No se pudo guardar la ficha médica en la base de datos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <Text style={styles.title}>Ficha Médica</Text>

      {/* Sección de foto del hijo */}
      <View style={styles.fotoContainer}>
        <Pressable style={styles.fotoButton} onPress={mostrarOpcionesFoto}>
          {fotoHijo ? (
            <View style={styles.fotoPreviewContainer}>
              <Image source={{ uri: fotoHijo.previewUri }} style={styles.fotoPreview} contentFit="cover" />
              <Pressable
                style={styles.eliminarFotoButton}
                onPress={(e) => {
                  e.stopPropagation();
                  Alert.alert(
                    'Eliminar foto',
                    '¿Estás seguro de que deseas eliminar esta foto?',
                    [
                      {
                        text: 'Cancelar',
                        style: 'cancel',
                      },
                      {
                        text: 'Eliminar',
                        style: 'destructive',
                        onPress: () => {
                          setFotoHijo(null);
                          AsyncStorage.removeItem('nuevoHijoFoto');
                        },
                      },
                    ]
                  );
                }}
              >
                <Ionicons name="close-circle" size={24} color="#d32f2f" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.fotoPlaceholder}>
              <Ionicons name="camera" size={48} color="#127067" />
              <Text style={styles.fotoPlaceholderText}>Foto del hijo</Text>
            </View>
          )}
        </Pressable>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Datos del Estudiante */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del Estudiante</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre Completo</Text>
            <TextInput
              style={styles.input}
              placeholder="Apellidos y nombres del estudiante"
              value={fichaMedica.nombreCompleto}
              onChangeText={(text) => actualizarCampo('nombreCompleto', text)}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Seguro complementario</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={fichaMedica.noAfiliacion}
                onValueChange={(valor) => actualizarCampo('noAfiliacion', valor)}
                style={styles.picker}
                itemStyle={Platform.OS === 'ios' ? styles.pickerItem : undefined}
              >
                <Picker.Item label="Seleccionar seguro" value="" color="#999" />
                <Picker.Item label="Fonsa" value="Fonsa" />
                <Picker.Item label="Isapre" value="Isapre" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nacionalidad</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={fichaMedica.nacionalidad}
                onValueChange={(valor) => actualizarCampo('nacionalidad', valor)}
                style={styles.picker}
                itemStyle={Platform.OS === 'ios' ? styles.pickerItem : undefined}
              >
                <Picker.Item label="Seleccionar nacionalidad" value="" color="#999" />
                {PAISES_LATINOAMERICANOS.map((pais) => (
                  <Picker.Item key={pais} label={pais} value={pais} />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Género</Text>
            <View style={styles.radioGroup}>
              <Pressable
                style={[styles.radioButton, fichaMedica.genero === 'F' && styles.radioButtonSelected]}
                onPress={() => actualizarCampo('genero', 'F')}
              >
                <Text style={[styles.radioText, fichaMedica.genero === 'F' && styles.radioTextSelected]}>F</Text>
              </Pressable>
              <Pressable
                style={[styles.radioButton, fichaMedica.genero === 'M' && styles.radioButtonSelected]}
                onPress={() => actualizarCampo('genero', 'M')}
              >
                <Text style={[styles.radioText, fichaMedica.genero === 'M' && styles.radioTextSelected]}>M</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth, styles.firstHalfWidth]}>
              <Text style={styles.label}>Fecha de Nacimiento</Text>
              <TextInput
                style={styles.input}
                placeholder="dd/mm/yyyy"
                value={fichaMedica.fechaNacimiento}
                onChangeText={(text) => actualizarCampo('fechaNacimiento', text)}
              />
            </View>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Edad</Text>
              <TextInput
                style={styles.input}
                placeholder="Edad"
                value={fichaMedica.edad}
                onChangeText={(text) => actualizarCampo('edad', text)}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dirección</Text>
            <TextInput
              style={styles.input}
              placeholder="Dirección"
              value={fichaMedica.direccion}
              onChangeText={(text) => actualizarCampo('direccion', text)}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth, styles.firstHalfWidth]}>
              <Text style={styles.label}>Código Postal</Text>
              <TextInput
                style={styles.input}
                placeholder="Código postal"
                value={fichaMedica.codigoPostal}
                onChangeText={(text) => actualizarCampo('codigoPostal', text)}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Localidad</Text>
              <TextInput
                style={styles.input}
                placeholder="Localidad"
                value={fichaMedica.localidad}
                onChangeText={(text) => actualizarCampo('localidad', text)}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth, styles.firstHalfWidth]}>
              <Text style={styles.label}>Teléfono (Casa)</Text>
              <TextInput
                style={styles.input}
                placeholder="Teléfono casa"
                value={fichaMedica.telefonoCasa}
                onChangeText={(text) => actualizarCampo('telefonoCasa', text)}
                keyboardType="phone-pad"
              />
            </View>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Celular</Text>
              <TextInput
                style={styles.input}
                placeholder="Celular"
                value={fichaMedica.celular}
                onChangeText={(text) => actualizarCampo('celular', text)}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Correo Electrónico</Text>
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              value={fichaMedica.correoElectronico}
              onChangeText={(text) => actualizarCampo('correoElectronico', text)}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Datos de Padres/Tutores */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos de los Padres o Tutores</Text>
          
          <Text style={styles.subsectionTitle}>Padre/Tutor 1</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre y Apellido</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre y apellido"
              value={fichaMedica.padre1Nombre}
              onChangeText={(text) => actualizarCampo('padre1Nombre', text)}
            />
          </View>
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth, styles.firstHalfWidth]}>
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                placeholder="Teléfono"
                value={fichaMedica.padre1Telefono}
                onChangeText={(text) => actualizarCampo('padre1Telefono', text)}
                keyboardType="phone-pad"
              />
            </View>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Parentesco</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={fichaMedica.padre1Parentesco}
                  onValueChange={(value) => actualizarCampo('padre1Parentesco', value)}
                  style={styles.picker}
                  itemStyle={Platform.OS === 'ios' ? styles.pickerItem : undefined}
                >
                  <Picker.Item label="Seleccionar parentesco" value="" color="#999" />
                  {PARENTESCOS_FAMILIARES.map((parentesco) => (
                    <Picker.Item
                      key={parentesco}
                      label={parentesco}
                      value={parentesco}
                      color="#000"
                    />
                  ))}
                </Picker>
              </View>
            </View>
          </View>

          <Text style={styles.subsectionTitle}>Padre/Tutor 2</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombre y Apellido</Text>
            <TextInput
              style={styles.input}
              placeholder="Nombre y apellido"
              value={fichaMedica.padre2Nombre}
              onChangeText={(text) => actualizarCampo('padre2Nombre', text)}
            />
          </View>
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth, styles.firstHalfWidth]}>
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                placeholder="Teléfono"
                value={fichaMedica.padre2Telefono}
                onChangeText={(text) => actualizarCampo('padre2Telefono', text)}
                keyboardType="phone-pad"
              />
            </View>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Parentesco</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={fichaMedica.padre2Parentesco}
                  onValueChange={(value) => actualizarCampo('padre2Parentesco', value)}
                  style={styles.picker}
                  itemStyle={Platform.OS === 'ios' ? styles.pickerItem : undefined}
                >
                  <Picker.Item label="Seleccionar parentesco" value="" color="#999" />
                  {PARENTESCOS_FAMILIARES.map((parentesco) => (
                    <Picker.Item
                      key={parentesco}
                      label={parentesco}
                      value={parentesco}
                      color="#000"
                    />
                  ))}
                </Picker>
              </View>
            </View>
          </View>
        </View>

        {/* Información Médica */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información Médica</Text>
          
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth, styles.firstHalfWidth]}>
              <Text style={styles.label}>Grupo Sanguíneo</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={fichaMedica.grupoSanguineo}
                  onValueChange={(value) => actualizarCampo('grupoSanguineo', value)}
                  style={styles.picker}
                  itemStyle={Platform.OS === 'ios' ? styles.pickerItem : undefined}
                >
                  <Picker.Item label="Seleccionar tipo sanguíneo" value="" color="#999" />
                  {TIPOS_SANGUINEOS.map((tipo) => (
                    <Picker.Item
                      key={tipo}
                      label={tipo}
                      value={tipo}
                      color="#000"
                    />
                  ))}
                </Picker>
              </View>
            </View>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Teléfono de Emergencias *</Text>
              <TextInput
                style={styles.input}
                placeholder="Teléfono emergencias"
                value={fichaMedica.telefonoEmergencias}
                onChangeText={(text) => actualizarCampo('telefonoEmergencias', text)}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <Text style={styles.subsectionTitle}>
            ¿Ha tenido o tiene alguno de estos padecimientos?
          </Text>
          <Text style={styles.hint}>Marcar con X si corresponde</Text>

          <View style={styles.checkboxContainer}>
            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('asma', !fichaMedica.condiciones.asma)}
            >
              <Ionicons
                name={fichaMedica.condiciones.asma ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.asma ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Asma</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('enfermedadesRespiratorias', !fichaMedica.condiciones.enfermedadesRespiratorias)}
            >
              <Ionicons
                name={fichaMedica.condiciones.enfermedadesRespiratorias ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.enfermedadesRespiratorias ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Enfermedades Respiratorias</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('enfermedadesCardiacas', !fichaMedica.condiciones.enfermedadesCardiacas)}
            >
              <Ionicons
                name={fichaMedica.condiciones.enfermedadesCardiacas ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.enfermedadesCardiacas ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Enfermedades Cardíacas</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('enfermedadesGastricas', !fichaMedica.condiciones.enfermedadesGastricas)}
            >
              <Ionicons
                name={fichaMedica.condiciones.enfermedadesGastricas ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.enfermedadesGastricas ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Enfermedades Gástricas</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('hepatitis', !fichaMedica.condiciones.hepatitis)}
            >
              <Ionicons
                name={fichaMedica.condiciones.hepatitis ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.hepatitis ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Hepatitis</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('anemias', !fichaMedica.condiciones.anemias)}
            >
              <Ionicons
                name={fichaMedica.condiciones.anemias ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.anemias ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Anemias</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('hipertension', !fichaMedica.condiciones.hipertension)}
            >
              <Ionicons
                name={fichaMedica.condiciones.hipertension ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.hipertension ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Hipertensión Arterial (Presión alta)</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('hipotension', !fichaMedica.condiciones.hipotension)}
            >
              <Ionicons
                name={fichaMedica.condiciones.hipotension ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.hipotension ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Hipotensión Arterial (Presión baja)</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('diabetes', !fichaMedica.condiciones.diabetes)}
            >
              <Ionicons
                name={fichaMedica.condiciones.diabetes ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.diabetes ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Diabetes</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('epilepsia', !fichaMedica.condiciones.epilepsia)}
            >
              <Ionicons
                name={fichaMedica.condiciones.epilepsia ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.epilepsia ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Epilepsia</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('convulsiones', !fichaMedica.condiciones.convulsiones)}
            >
              <Ionicons
                name={fichaMedica.condiciones.convulsiones ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.convulsiones ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Convulsiones</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('hernias', !fichaMedica.condiciones.hernias)}
            >
              <Ionicons
                name={fichaMedica.condiciones.hernias ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.hernias ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Hernias</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('celiaquismo', !fichaMedica.condiciones.celiaquismo)}
            >
              <Ionicons
                name={fichaMedica.condiciones.celiaquismo ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.celiaquismo ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Celiaquismo (Intolerancia al Gluten)</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('dolorCabezaSevero', !fichaMedica.condiciones.dolorCabezaSevero)}
            >
              <Ionicons
                name={fichaMedica.condiciones.dolorCabezaSevero ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.dolorCabezaSevero ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Dolor de Cabeza Severo</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('problemasPsiquiatricos', !fichaMedica.condiciones.problemasPsiquiatricos)}
            >
              <Ionicons
                name={fichaMedica.condiciones.problemasPsiquiatricos ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.problemasPsiquiatricos ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Problemas Psiquiátricos</Text>
            </Pressable>

            <Pressable
              style={styles.checkboxRow}
              onPress={() => actualizarCondicion('fracturasTraumatismos', !fichaMedica.condiciones.fracturasTraumatismos)}
            >
              <Ionicons
                name={fichaMedica.condiciones.fracturasTraumatismos ? 'checkbox' : 'square-outline'}
                size={24}
                color={fichaMedica.condiciones.fracturasTraumatismos ? '#127067' : '#666'}
              />
              <Text style={styles.checkboxLabel}>Fracturas y/o Traumatismos (Últimos 60 días)</Text>
            </Pressable>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>¿Está tomando algún medicamento?</Text>
            <View style={styles.radioGroup}>
              <Pressable
                style={[styles.radioButton, fichaMedica.tomaMedicamentos === 'SÍ' && styles.radioButtonSelected]}
                onPress={() => actualizarCampo('tomaMedicamentos', 'SÍ')}
              >
                <Text style={[styles.radioText, fichaMedica.tomaMedicamentos === 'SÍ' && styles.radioTextSelected]}>SÍ</Text>
              </Pressable>
              <Pressable
                style={[styles.radioButton, fichaMedica.tomaMedicamentos === 'NO' && styles.radioButtonSelected]}
                onPress={() => actualizarCampo('tomaMedicamentos', 'NO')}
              >
                <Text style={[styles.radioText, fichaMedica.tomaMedicamentos === 'NO' && styles.radioTextSelected]}>NO</Text>
              </Pressable>
            </View>
          </View>

          {fichaMedica.tomaMedicamentos === 'SÍ' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Especificar medicamentos:</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Indicar medicamentos y dosis"
                value={fichaMedica.medicamentos}
                onChangeText={(text) => actualizarCampo('medicamentos', text)}
                multiline
                numberOfLines={4}
              />
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>¿Reacción alérgica a medicamentos o alimentos? Describa cuáles:</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Describir alergias"
              value={fichaMedica.alergias}
              onChangeText={(text) => actualizarCampo('alergias', text)}
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>¿Tiene alguna discapacidad física que requiera atención especial?</Text>
            <View style={styles.radioGroup}>
              <Pressable
                style={[styles.radioButton, fichaMedica.tieneDiscapacidad === 'SÍ' && styles.radioButtonSelected]}
                onPress={() => actualizarCampo('tieneDiscapacidad', 'SÍ')}
              >
                <Text style={[styles.radioText, fichaMedica.tieneDiscapacidad === 'SÍ' && styles.radioTextSelected]}>SÍ</Text>
              </Pressable>
              <Pressable
                style={[styles.radioButton, fichaMedica.tieneDiscapacidad === 'NO' && styles.radioButtonSelected]}
                onPress={() => actualizarCampo('tieneDiscapacidad', 'NO')}
              >
                <Text style={[styles.radioText, fichaMedica.tieneDiscapacidad === 'NO' && styles.radioTextSelected]}>NO</Text>
              </Pressable>
            </View>
          </View>

          {fichaMedica.tieneDiscapacidad === 'SÍ' && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Especificar discapacidad:</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describir discapacidad y necesidades especiales"
                value={fichaMedica.discapacidad}
                onChangeText={(text) => actualizarCampo('discapacidad', text)}
                multiline
                numberOfLines={4}
              />
            </View>
          )}
        </View>

        <Pressable
          style={[styles.button, loading && styles.disabledButton]}
          onPress={manejarGuardar}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Guardar</Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Modal de Confirmación */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirmar Guardado</Text>
            <Text style={styles.modalText}>
              ¿Usted como apoderado aprueba que se guarde la información médica del niño?
            </Text>
            
            <View style={styles.checkboxRow}>
              <Switch
                value={aprobado}
                onValueChange={setAprobado}
                trackColor={{ false: '#ccc', true: '#85d7c0' }}
                thumbColor={aprobado ? '#127067' : '#f4f3f4'}
              />
              <Text style={styles.modalCheckboxLabel}>Aprobar guardado de información médica</Text>
            </View>

            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setModalVisible(false);
                  setAprobado(false);
                }}
              >
                <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={confirmarGuardar}
              >
                <Text style={styles.modalButtonTextConfirm}>Confirmar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Éxito */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalExitoVisible}
        onRequestClose={() => setModalExitoVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalExitoContent}>
            <Text style={styles.exitoIcon}>✅</Text>
            <Text style={styles.modalExitoTitle}>Hijo agregado y guardado exitosamente</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: 60,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    padding: 6,
    zIndex: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#127067',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  fotoContainer: {
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  fotoButton: {
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: 'hidden',
    backgroundColor: '#F5F7F8',
    borderWidth: 2,
    borderColor: '#127067',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fotoButtonActive: {
    borderStyle: 'solid',
  },
  fotoPreviewContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  fotoPreview: {
    width: '100%',
    height: '100%',
  },
  eliminarFotoButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 2,
    zIndex: 10,
  },
  fotoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  fotoPlaceholderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#127067',
    marginTop: 8,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  section: {
    marginBottom: 30,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#127067',
    marginBottom: 15,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 15,
    marginBottom: 10,
  },
  hint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#127067',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#F5F7F8',
    minHeight: 48,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#127067',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F5F7F8',
    minHeight: 48, // Misma altura que los inputs
  },
  picker: {
    width: '100%',
    height: Platform.OS === 'ios' ? 150 : 48,
  },
  pickerItem: {
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start', // Alinea los campos desde arriba
  },
  halfWidth: {
    flex: 1,
    minWidth: 0, // Asegura que flex funcione correctamente
  },
  firstHalfWidth: {
    marginRight: 12, // Espaciado consistente entre campos en fila
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 5,
  },
  radioButton: {
    borderWidth: 2,
    borderColor: '#127067',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  radioButtonSelected: {
    backgroundColor: '#127067',
  },
  radioText: {
    fontSize: 16,
    color: '#127067',
    fontWeight: '600',
  },
  radioTextSelected: {
    color: '#ffffff',
  },
  checkboxContainer: {
    marginTop: 10,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 5,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#333',
    marginLeft: 10,
  },
  button: {
    backgroundColor: '#127067',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 25,
    marginTop: 20,
    marginBottom: 30,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 25,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#127067',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 24,
  },
  modalCheckboxLabel: {
    fontSize: 14,
    color: '#333',
    marginLeft: 10,
    flex: 1,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#e0e0e0',
  },
  modalButtonConfirm: {
    backgroundColor: '#127067',
  },
  modalButtonTextCancel: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextConfirm: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalExitoContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 30,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitoIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  modalExitoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#127067',
    textAlign: 'center',
  },
});
