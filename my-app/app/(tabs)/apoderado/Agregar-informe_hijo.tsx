import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

interface DatosHijoDraft {
  nombres: string;
  apellidos: string;
  rut: string;
  fechaNacimiento: string;
  edad: string;
  rutUsuario: string;
}

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

      const datosCompletos = {
        ...datosHijo,
        fichaMedica: {
          ...fichaMedica,
          fechaGuardado: new Date().toISOString(),
        },
        actualizadoEn: serverTimestamp(),
      };

      await setDoc(doc(db, 'Hijos', datosHijo.rut), datosCompletos, { merge: true });

      await AsyncStorage.multiRemove(['nuevoHijoData', 'nuevoHijoHorario']);

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

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>No. Afiliación</Text>
              <TextInput
                style={styles.input}
                placeholder="Número de afiliación"
                value={fichaMedica.noAfiliacion}
                onChangeText={(text) => actualizarCampo('noAfiliacion', text)}
                keyboardType="numeric"
              />
            </View>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Nacionalidad</Text>
              <TextInput
                style={styles.input}
                placeholder="Nacionalidad"
                value={fichaMedica.nacionalidad}
                onChangeText={(text) => actualizarCampo('nacionalidad', text)}
              />
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
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Fecha de Nacimiento (dd/mm/yyyy)</Text>
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
            <View style={[styles.inputGroup, styles.halfWidth]}>
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
            <View style={[styles.inputGroup, styles.halfWidth]}>
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
            <View style={[styles.inputGroup, styles.halfWidth]}>
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
              <TextInput
                style={styles.input}
                placeholder="Parentesco"
                value={fichaMedica.padre1Parentesco}
                onChangeText={(text) => actualizarCampo('padre1Parentesco', text)}
              />
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
            <View style={[styles.inputGroup, styles.halfWidth]}>
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
              <TextInput
                style={styles.input}
                placeholder="Parentesco"
                value={fichaMedica.padre2Parentesco}
                onChangeText={(text) => actualizarCampo('padre2Parentesco', text)}
              />
            </View>
          </View>
        </View>

        {/* Información Médica */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Información Médica</Text>
          
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Grupo Sanguíneo</Text>
              <TextInput
                style={styles.input}
                placeholder="Grupo sanguíneo"
                value={fichaMedica.grupoSanguineo}
                onChangeText={(text) => actualizarCampo('grupoSanguineo', text)}
              />
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
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  halfWidth: {
    flex: 1,
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
