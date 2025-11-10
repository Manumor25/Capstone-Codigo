import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View
} from 'react-native';

interface FichaMedica {
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
  padre1Nombre: string;
  padre1Telefono: string;
  padre1Parentesco: string;
  padre2Nombre: string;
  padre2Telefono: string;
  padre2Parentesco: string;
  grupoSanguineo: string;
  telefonoEmergencias: string;
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
  tomaMedicamentos: 'SÍ' | 'NO' | '';
  medicamentos: string;
  alergias: string;
  tieneDiscapacidad: 'SÍ' | 'NO' | '';
  discapacidad: string;
}

export default function VerFichaMedicaScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  useSyncRutActivo();

  const [cargando, setCargando] = useState(true);
  const [fichaMedica, setFichaMedica] = useState<FichaMedica | null>(null);
  const [nombreHijo, setNombreHijo] = useState('');

  useEffect(() => {
    const cargarFichaMedica = async () => {
      try {
        const hijoId = params.id as string;
        if (!hijoId) {
          Alert.alert('Error', 'No se identificó el registro del niño.');
          router.back();
          return;
        }

        const hijoRef = doc(db, 'Hijos', hijoId);
        const snapshot = await getDoc(hijoRef);

        if (!snapshot.exists()) {
          Alert.alert('Error', 'No se encontró la ficha médica del niño.');
          router.back();
          return;
        }

        const data = snapshot.data() || {};
        setNombreHijo(`${data.nombres || ''} ${data.apellidos || ''}`.trim());

        if (data.fichaMedica) {
          setFichaMedica(data.fichaMedica);
        } else {
          Alert.alert('Información', 'No hay ficha médica guardada para este niño.');
          router.back();
        }
      } catch (error) {
        console.error('Error al cargar la ficha médica:', error);
        Alert.alert('Error', 'No se pudo cargar la ficha médica.');
        router.back();
      } finally {
        setCargando(false);
      }
    };

    cargarFichaMedica();
  }, [params.id, router]);

  const obtenerCondicionesMarcadas = () => {
    if (!fichaMedica) return 'Ninguna';
    const condiciones: string[] = [];
    const condicionesLabels: { [key: string]: string } = {
      asma: 'Asma',
      enfermedadesRespiratorias: 'Enfermedades Respiratorias',
      enfermedadesCardiacas: 'Enfermedades Cardíacas',
      enfermedadesGastricas: 'Enfermedades Gástricas',
      hepatitis: 'Hepatitis',
      anemias: 'Anemias',
      hipertension: 'Hipertensión Arterial',
      hipotension: 'Hipotensión Arterial',
      diabetes: 'Diabetes',
      epilepsia: 'Epilepsia',
      convulsiones: 'Convulsiones',
      hernias: 'Hernias',
      celiaquismo: 'Celiaquismo',
      dolorCabezaSevero: 'Dolor de Cabeza Severo',
      problemasPsiquiatricos: 'Problemas Psiquiátricos',
      fracturasTraumatismos: 'Fracturas y/o Traumatismos',
    };

    Object.entries(fichaMedica.condiciones).forEach(([key, value]) => {
      if (value && condicionesLabels[key]) {
        condiciones.push(condicionesLabels[key]);
      }
    });

    return condiciones.length > 0 ? condiciones.join(', ') : 'Ninguna';
  };


  if (cargando) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#127067" size="large" />
        <Text style={styles.loadingText}>Cargando ficha médica...</Text>
      </View>
    );
  }

  if (!fichaMedica) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <Text style={styles.title}>Ficha Médica</Text>
      <Text style={styles.subtitle}>{nombreHijo}</Text>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
      >
        {/* Tabla de Datos */}
        <View style={styles.table}>
          {/* Datos del Estudiante */}
          <View style={styles.tableSection}>
            <Text style={styles.tableSectionTitle}>Datos del Estudiante</Text>
            
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Nombre Completo:</Text>
              <Text style={styles.tableValue}>{fichaMedica.nombreCompleto || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Seguro complementario de salud:</Text>
              <Text style={styles.tableValue}>{fichaMedica.noAfiliacion || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Nacionalidad:</Text>
              <Text style={styles.tableValue}>{fichaMedica.nacionalidad || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Género:</Text>
              <Text style={styles.tableValue}>{fichaMedica.genero || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Fecha de Nacimiento:</Text>
              <Text style={styles.tableValue}>{fichaMedica.fechaNacimiento || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Edad:</Text>
              <Text style={styles.tableValue}>{fichaMedica.edad || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Dirección:</Text>
              <Text style={styles.tableValue}>{fichaMedica.direccion || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Código Postal:</Text>
              <Text style={styles.tableValue}>{fichaMedica.codigoPostal || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Localidad:</Text>
              <Text style={styles.tableValue}>{fichaMedica.localidad || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Teléfono (Casa):</Text>
              <Text style={styles.tableValue}>{fichaMedica.telefonoCasa || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Celular:</Text>
              <Text style={styles.tableValue}>{fichaMedica.celular || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Correo Electrónico:</Text>
              <Text style={styles.tableValue}>{fichaMedica.correoElectronico || 'N/A'}</Text>
            </View>
          </View>

          {/* Datos de Padres/Tutores */}
          <View style={styles.tableSection}>
            <Text style={styles.tableSectionTitle}>Datos de los Padres o Tutores</Text>
            
            <Text style={styles.subsectionTitle}>Padre/Tutor 1</Text>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Nombre y Apellido:</Text>
              <Text style={styles.tableValue}>{fichaMedica.padre1Nombre || 'N/A'}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Teléfono:</Text>
              <Text style={styles.tableValue}>{fichaMedica.padre1Telefono || 'N/A'}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Parentesco:</Text>
              <Text style={styles.tableValue}>{fichaMedica.padre1Parentesco || 'N/A'}</Text>
            </View>

            <Text style={styles.subsectionTitle}>Padre/Tutor 2</Text>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Nombre y Apellido:</Text>
              <Text style={styles.tableValue}>{fichaMedica.padre2Nombre || 'N/A'}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Teléfono:</Text>
              <Text style={styles.tableValue}>{fichaMedica.padre2Telefono || 'N/A'}</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Parentesco:</Text>
              <Text style={styles.tableValue}>{fichaMedica.padre2Parentesco || 'N/A'}</Text>
            </View>
          </View>

          {/* Información Médica */}
          <View style={styles.tableSection}>
            <Text style={styles.tableSectionTitle}>Información Médica</Text>
            
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Grupo Sanguíneo:</Text>
              <Text style={styles.tableValue}>{fichaMedica.grupoSanguineo || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Teléfono de Emergencias:</Text>
              <Text style={styles.tableValue}>{fichaMedica.telefonoEmergencias || 'N/A'}</Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Condiciones Médicas:</Text>
              <Text style={[styles.tableValue, styles.tableValueMultiline]}>
                {obtenerCondicionesMarcadas()}
              </Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>¿Toma Medicamentos?</Text>
              <Text style={styles.tableValue}>{fichaMedica.tomaMedicamentos || 'N/A'}</Text>
            </View>

            {fichaMedica.tomaMedicamentos === 'SÍ' && (
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Medicamentos:</Text>
                <Text style={[styles.tableValue, styles.tableValueMultiline]}>
                  {fichaMedica.medicamentos || 'N/A'}
                </Text>
              </View>
            )}

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Alergias:</Text>
              <Text style={[styles.tableValue, styles.tableValueMultiline]}>
                {fichaMedica.alergias || 'Ninguna'}
              </Text>
            </View>

            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>¿Tiene Discapacidad?</Text>
              <Text style={styles.tableValue}>{fichaMedica.tieneDiscapacidad || 'N/A'}</Text>
            </View>

            {fichaMedica.tieneDiscapacidad === 'SÍ' && (
              <View style={styles.tableRow}>
                <Text style={styles.tableLabel}>Discapacidad:</Text>
                <Text style={[styles.tableValue, styles.tableValueMultiline]}>
                  {fichaMedica.discapacidad || 'N/A'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
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
    marginBottom: 5,
    paddingHorizontal: 20,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
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
  table: {
    backgroundColor: '#ffffff',
  },
  tableSection: {
    marginBottom: 25,
    padding: 15,
    backgroundColor: '#F5F7F8',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#127067',
  },
  tableSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#127067',
    marginBottom: 15,
    textAlign: 'center',
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#127067',
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 15,
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    minHeight: 40,
  },
  tableLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginRight: 10,
  },
  tableValue: {
    flex: 1.5,
    fontSize: 14,
    color: '#555',
    textAlign: 'right',
  },
  tableValueMultiline: {
    textAlign: 'left',
    marginTop: 5,
  },
});

