import React, { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { db } from '@/firebaseConfig';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  doc,
  updateDoc,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Picker } from '@react-native-picker/picker';
import { Platform } from 'react-native';

// Estructura de Regiones y Comunas de Chile
const REGIONES_Y_COMUNAS: { [region: string]: string[] } = {
  'Arica y Parinacota': ['Arica', 'Camarones', 'Putre', 'General Lagos'],
  'Tarapacá': ['Iquique', 'Alto Hospicio', 'Pozo Almonte', 'Camiña', 'Colchane', 'Huara', 'Pica'],
  'Antofagasta': ['Antofagasta', 'Mejillones', 'Sierra Gorda', 'Taltal', 'Calama', 'Ollagüe', 'San Pedro de Atacama', 'Tocopilla', 'María Elena'],
  'Atacama': ['Copiapó', 'Caldera', 'Tierra Amarilla', 'Chañaral', 'Diego de Almagro', 'Vallenar', 'Alto del Carmen', 'Freirina', 'Huasco'],
  'Coquimbo': ['La Serena', 'Coquimbo', 'Andacollo', 'La Higuera', 'Paiguano', 'Vicuña', 'Illapel', 'Canela', 'Los Vilos', 'Salamanca', 'Ovalle', 'Combarbalá', 'Monte Patria', 'Punitaqui', 'Río Hurtado'],
  'Valparaíso': ['Valparaíso', 'Casablanca', 'Concón', 'Juan Fernández', 'Puchuncaví', 'Quintero', 'Viña del Mar', 'Isla de Pascua', 'Los Andes', 'Calle Larga', 'Rinconada', 'San Esteban', 'La Ligua', 'Cabildo', 'Papudo', 'Petorca', 'Zapallar', 'Quillota', 'Calera', 'Hijuelas', 'La Cruz', 'Nogales', 'San Antonio', 'Algarrobo', 'Cartagena', 'El Quisco', 'El Tabo', 'Santo Domingo', 'San Felipe', 'Catemu', 'Llaillay', 'Panquehue', 'Putaendo', 'Santa María', 'Quilpué', 'Limache', 'Olmué', 'Villa Alemana'],
  'Región Metropolitana de Santiago': ['Santiago', 'Cerrillos', 'Cerro Navia', 'Conchalí', 'El Bosque', 'Estación Central', 'Huechuraba', 'Independencia', 'La Cisterna', 'La Florida', 'La Granja', 'La Pintana', 'La Reina', 'Las Condes', 'Lo Barnechea', 'Lo Espejo', 'Lo Prado', 'Macul', 'Maipú', 'Ñuñoa', 'Pedro Aguirre Cerda', 'Peñalolén', 'Providencia', 'Pudahuel', 'Quilicura', 'Quinta Normal', 'Recoleta', 'Renca', 'San Joaquín', 'San Miguel', 'San Ramón', 'Vitacura', 'Puente Alto', 'Pirque', 'San José de Maipo', 'Colina', 'Lampa', 'Tiltil', 'San Bernardo', 'Buin', 'Calera de Tango', 'Paine', 'Melipilla', 'Alhué', 'Curacaví', 'María Pinto', 'San Pedro', 'Talagante', 'El Monte', 'Isla de Maipo', 'Padre Hurtado', 'Peñaflor'],
  "O'Higgins": ['Rancagua', 'Codegua', 'Coinco', 'Coltauco', 'Doñihue', 'Graneros', 'Las Cabras', 'Machalí', 'Malloa', 'Mostazal', 'Olivar', 'Peumo', 'Pichidegua', 'Quinta de Tilcoco', 'Rengo', 'Requínoa', 'San Vicente', 'Pichilemu', 'La Estrella', 'Litueche', 'Marchihue', 'Navidad', 'Paredones', 'San Fernando', 'Chépica', 'Chimbarongo', 'Lolol', 'Nancagua', 'Palmilla', 'Peralillo', 'Placilla', 'Pumanque', 'Santa Cruz'],
  'Maule': ['Talca', 'Constitución', 'Curepto', 'Empedrado', 'Maule', 'Pelarco', 'Pencahue', 'Río Claro', 'San Clemente', 'San Rafael', 'Cauquenes', 'Chanco', 'Pelluhue', 'Curicó', 'Hualañé', 'Licantén', 'Molina', 'Rauco', 'Romeral', 'Sagrada Familia', 'Teno', 'Vichuquén', 'Linares', 'Colbún', 'Longaví', 'Parral', 'Retiro', 'San Javier', 'Villa Alegre', 'Yerbas Buenas'],
  'Ñuble': ['Chillán', 'Bulnes', 'Chillán Viejo', 'El Carmen', 'Pemuco', 'Pinto', 'Quillón', 'San Ignacio', 'Yungay', 'Quirihue', 'Cobquecura', 'Coelemu', 'Ninhue', 'Portezuelo', 'Ránquil', 'Treguaco', 'San Carlos', 'Coihueco', 'Ñiquén', 'San Fabián', 'San Nicolás'],
  'Biobío': ['Concepción', 'Coronel', 'Chiguayante', 'Florida', 'Hualpén', 'Hualqui', 'Lota', 'Penco', 'San Pedro de la Paz', 'Santa Juana', 'Talcahuano', 'Tomé', 'Los Ángeles', 'Antuco', 'Cabrero', 'Laja', 'Mulchén', 'Nacimiento', 'Negrete', 'Quilaco', 'Quilleco', 'San Rosendo', 'Santa Bárbara', 'Tucapel', 'Yumbel', 'Alto Biobío', 'Lebu', 'Arauco', 'Cañete', 'Contulmo', 'Curanilahue', 'Los Álamos', 'Tirúa'],
  'Araucanía': ['Temuco', 'Carahue', 'Cunco', 'Curarrehue', 'Freire', 'Galvarino', 'Gorbea', 'Lautaro', 'Loncoche', 'Melipeuco', 'Nueva Imperial', 'Padre Las Casas', 'Perquenco', 'Pitrufquén', 'Pucón', 'Saavedra', 'Teodoro Schmidt', 'Toltén', 'Vilcún', 'Villarrica', 'Cholchol', 'Angol', 'Collipulli', 'Curacautín', 'Ercilla', 'Lonquimay', 'Los Sauces', 'Lumaco', 'Purén', 'Renaico', 'Traiguén', 'Victoria'],
  'Los Ríos': ['Valdivia', 'Corral', 'Lanco', 'Los Lagos', 'Máfil', 'Mariquina', 'Paillaco', 'Panguipulli', 'La Unión', 'Futrono', 'Lago Ranco', 'Río Bueno'],
  'Los Lagos': ['Puerto Montt', 'Calbuco', 'Cochamó', 'Fresia', 'Frutillar', 'Los Muermos', 'Llanquihue', 'Maullín', 'Puerto Varas', 'Castro', 'Ancud', 'Chonchi', 'Curaco de Vélez', 'Dalcahue', 'Puqueldón', 'Queilén', 'Quellón', 'Quemchi', 'Quinchao', 'Osorno', 'Puerto Octay', 'Purranque', 'Puyehue', 'Río Negro', 'San Juan de la Costa', 'San Pablo', 'Chaitén', 'Futaleufú', 'Hualaihué', 'Palena'],
  'Aysén': ['Coyhaique', 'Lago Verde', 'Aysén', 'Cisnes', 'Guaitecas', 'Cochrane', "O'Higgins", 'Tortel', 'Chile Chico', 'Río Ibáñez'],
  'Magallanes y Antártica Chilena': ['Punta Arenas', 'Laguna Blanca', 'Río Verde', 'San Gregorio', 'Cabo de Hornos', 'Antártica', 'Porvenir', 'Primavera', 'Timaukel', 'Natales', 'Torres del Paine'],
};

const REGIONES = Object.keys(REGIONES_Y_COMUNAS);

export default function PublicarFurgonScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [nombre, setNombre] = useState('');
  const [colegio, setColegio] = useState('');
  const [direccionColegio, setDireccionColegio] = useState('');
  const [precio, setPrecio] = useState('');
  const [regionSeleccionada, setRegionSeleccionada] = useState('');
  const [comuna, setComuna] = useState('');
  const [patenteSeleccionada, setPatenteSeleccionada] = useState('');
  const [patentes, setPatentes] = useState<string[]>([]);
  const [vehiculos, setVehiculos] = useState<Array<{ patente: string; cupos?: number }>>([]);
  const [rutUsuario, setRutUsuario] = useState('');
  const [loading, setLoading] = useState(false);
  const [cupos, setCupos] = useState('');
  const [furgonExistente, setFurgonExistente] = useState<any>(null);
  const [modoEdicion, setModoEdicion] = useState(false);

  const [errores, setErrores] = useState({
    nombre: '',
    colegio: '',
    direccionColegio: '',
    precio: '',
    region: '',
    comuna: '',
    patente: '',
    cupos: '',
  });

  useEffect(() => {
    const obtenerDatos = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (!rutGuardado) {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
          return;
        }
        setRutUsuario(rutGuardado);

        // Cargar vehículos siempre (necesarios para el formulario)
        const vehiculosRef = collection(db, 'Vehiculos');
        const q = query(vehiculosRef, where('rutUsuario', '==', rutGuardado));
        const snapshot = await getDocs(q);

        const listaVehiculos = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              patente: data.patente ? data.patente.toUpperCase() : null,
              cupos: data.cupos ? Number(data.cupos) : undefined,
            };
          })
          .filter((vehiculo) => vehiculo.patente !== null) as Array<{ patente: string; cupos?: number }>;

        const listaPatentes = listaVehiculos.map((v) => v.patente);
        setVehiculos(listaVehiculos);
        setPatentes(listaPatentes);

        // Verificar si ya tiene un furgón promocionado
        const furgonesRef = collection(db, 'Furgones');
        const furgonesQuery = query(furgonesRef, where('rutUsuario', '==', rutGuardado));
        const furgonesSnapshot = await getDocs(furgonesQuery);
        
        if (!furgonesSnapshot.empty) {
          const furgonData = furgonesSnapshot.docs[0];
          const data = furgonData.data();
          setFurgonExistente({
            id: furgonData.id,
            ...data,
          });
          // No cargar el formulario si ya tiene un furgón (a menos que esté en modo edición)
          return;
        }

        // Si no tiene furgón, configurar valores por defecto
        if (listaPatentes.length > 0) {
          const primeraPatente = listaPatentes[0];
          setPatenteSeleccionada(primeraPatente);
          // Cargar cupos del primer vehículo si tiene
          const primerVehiculo = listaVehiculos.find((v) => v.patente === primeraPatente);
          if (primerVehiculo?.cupos) {
            setCupos(primerVehiculo.cupos.toString());
          }
        } else {
          setPatenteSeleccionada('');
        }
      } catch (error) {
        console.error('Error al obtener datos:', error);
        Alert.alert('Error', 'No se pudieron cargar los datos.');
      }
    };

    obtenerDatos();
  }, []);

  const cargarDatosFurgonExistente = () => {
    if (!furgonExistente) return;
    
    // Limpiar errores previos
    setErrores({
      nombre: '',
      colegio: '',
      direccionColegio: '',
      precio: '',
      region: '',
      comuna: '',
      patente: '',
      cupos: '',
    });
    
    // Cargar datos del furgón existente
    setNombre(furgonExistente.nombre || '');
    setColegio(furgonExistente.colegio || '');
    setDireccionColegio(furgonExistente.direccionColegio || '');
    setPrecio(furgonExistente.precio || '');
    setRegionSeleccionada(furgonExistente.region || '');
    setComuna(furgonExistente.comuna || '');
    setPatenteSeleccionada(furgonExistente.patente || '');
    setCupos(furgonExistente.cupos ? furgonExistente.cupos.toString() : '');
    setModoEdicion(true);
  };

  const manejarEditarFurgon = async () => {
    const cuposNumero = parseInt(cupos, 10);
    const nuevosErrores = {
      nombre: !nombre ? 'Ingresa el nombre' : '',
      colegio: !colegio ? 'Ingresa el colegio' : '',
      direccionColegio: !direccionColegio ? 'Ingresa la dirección del colegio' : '',
      precio: !precio ? 'Ingresa el precio' : '',
      region: !regionSeleccionada ? 'Selecciona una región' : '',
      comuna: !comuna ? 'Selecciona una comuna' : '',
      patente: !patenteSeleccionada ? 'Selecciona una patente' : '',
      cupos: !cupos ? 'Ingresa la cantidad de cupos' : 
             isNaN(cuposNumero) || cuposNumero < 1 || cuposNumero > 30 
             ? 'Los cupos deben ser un número entre 1 y 30' : '',
    };

    setErrores(nuevosErrores);

    if (Object.values(nuevosErrores).some((msg) => msg !== '')) return;

    if (!furgonExistente || !furgonExistente.id) {
      Alert.alert('Error', 'No se encontró el furgón a editar.');
      return;
    }

    try {
      setLoading(true);

      await updateDoc(doc(db, 'Furgones', furgonExistente.id), {
        nombre,
        colegio,
        direccionColegio,
        precio,
        region: regionSeleccionada,
        comuna,
        patente: patenteSeleccionada,
        cupos: cuposNumero,
        actualizadoEn: serverTimestamp(),
      });

      Alert.alert('✅ Éxito', 'Furgón actualizado correctamente.');
      setModoEdicion(false);
      setFurgonExistente(null);
      // Recargar datos
      router.replace('/(tabs)/conductor/promocionar-furgon');
    } catch (error) {
      console.error('Error al actualizar furgón:', error);
      Alert.alert('Error', 'No se pudo actualizar la información.');
    } finally {
      setLoading(false);
    }
  };


  const manejarPublicarFurgon = async () => {
    const cuposNumero = parseInt(cupos, 10);
    const nuevosErrores = {
      nombre: !nombre ? 'Ingresa el nombre' : '',
      colegio: !colegio ? 'Ingresa el colegio' : '',
      direccionColegio: !direccionColegio ? 'Ingresa la dirección del colegio' : '',
      precio: !precio ? 'Ingresa el precio' : '',
      region: !regionSeleccionada ? 'Selecciona una región' : '',
      comuna: !comuna ? 'Selecciona una comuna' : '',
      patente: !patenteSeleccionada ? 'Selecciona una patente' : '',
      cupos: !cupos ? 'Ingresa la cantidad de cupos' : 
             isNaN(cuposNumero) || cuposNumero < 1 || cuposNumero > 30 
             ? 'Los cupos deben ser un número entre 1 y 30' : '',
    };

    setErrores(nuevosErrores);

    if (Object.values(nuevosErrores).some((msg) => msg !== '')) return;

    if (!rutUsuario) {
      Alert.alert('Error', 'No se puede publicar sin el RUT del usuario.');
      return;
    }

    try {
      setLoading(true);

      await addDoc(collection(db, 'Furgones'), {
        nombre,
        colegio,
        direccionColegio,
        precio,
        region: regionSeleccionada,
        comuna,
        patente: patenteSeleccionada,
        rutUsuario,
        cupos: cuposNumero,
        creadoEn: serverTimestamp(),
      });

      Alert.alert('✅ Éxito', 'Furgón publicado correctamente.');
      router.push('/(tabs)/conductor/pagina-principal-conductor');
    } catch (error) {
      console.error('Error al publicar furgón:', error);
      Alert.alert('Error', 'No se pudo guardar la información.');
    } finally {
      setLoading(false);
    }
  };

  const handleVolver = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/(tabs)/conductor/pagina-principal-conductor');
    }
  };

  // Si tiene un furgón existente y no está en modo edición, mostrar opciones
  if (furgonExistente && !modoEdicion) {
    return (
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={handleVolver}>
          <Ionicons name="arrow-back" size={28} color="#127067" />
        </Pressable>

        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Furgón Promocionado</Text>

          <View style={styles.profileImageContainer}>
            <Image
              source={require('@/assets/images/user_icon.png')}
              style={styles.profileImage}
              contentFit="cover"
            />
          </View>

          <View style={styles.furgonInfoContainer}>
            <Text style={styles.furgonInfoTitle}>Información del Furgón</Text>
            <View style={styles.furgonInfoItem}>
              <Text style={styles.furgonInfoLabel}>Nombre:</Text>
              <Text style={styles.furgonInfoValue}>{furgonExistente.nombre || 'N/A'}</Text>
            </View>
            <View style={styles.furgonInfoItem}>
              <Text style={styles.furgonInfoLabel}>Colegio:</Text>
              <Text style={styles.furgonInfoValue}>{furgonExistente.colegio || 'N/A'}</Text>
            </View>
            {furgonExistente.direccionColegio && (
              <View style={styles.furgonInfoItem}>
                <Text style={styles.furgonInfoLabel}>Dirección:</Text>
                <Text style={styles.furgonInfoValue}>{furgonExistente.direccionColegio}</Text>
              </View>
            )}
            <View style={styles.furgonInfoItem}>
              <Text style={styles.furgonInfoLabel}>Precio:</Text>
              <Text style={styles.furgonInfoValue}>${furgonExistente.precio || 'N/A'} CLP</Text>
            </View>
            <View style={styles.furgonInfoItem}>
              <Text style={styles.furgonInfoLabel}>Región:</Text>
              <Text style={styles.furgonInfoValue}>{furgonExistente.region || 'N/A'}</Text>
            </View>
            <View style={styles.furgonInfoItem}>
              <Text style={styles.furgonInfoLabel}>Comuna:</Text>
              <Text style={styles.furgonInfoValue}>{furgonExistente.comuna || 'N/A'}</Text>
            </View>
            <View style={styles.furgonInfoItem}>
              <Text style={styles.furgonInfoLabel}>Patente:</Text>
              <Text style={styles.furgonInfoValue}>{furgonExistente.patente || 'N/A'}</Text>
            </View>
            <View style={styles.furgonInfoItem}>
              <Text style={styles.furgonInfoLabel}>Cupos:</Text>
              <Text style={styles.furgonInfoValue}>{furgonExistente.cupos || 'N/A'}</Text>
            </View>
          </View>

          <View style={styles.buttonsContainer}>
            <Pressable 
              style={[styles.button, styles.buttonEditar]} 
              onPress={cargarDatosFurgonExistente}
              disabled={loading}
            >
              <Ionicons name="create-outline" size={20} color="#fff" />
              <Text style={styles.buttonText}>Editar</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={handleVolver}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <ScrollView 
        contentContainerStyle={styles.scrollFormContent}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{modoEdicion ? 'Editar Furgón' : 'Publicar Furgón'}</Text>

        <View style={styles.profileImageContainer}>
          <Image
            source={require('@/assets/images/user_icon.png')}
            style={styles.profileImage}
            contentFit="cover"
          />
        </View>

      <TextInput
        style={styles.input}
        placeholder="Nombre"
        value={nombre}
        onChangeText={setNombre}
      />
      {errores.nombre ? <Text style={styles.errorText}>{errores.nombre}</Text> : null}

      <Text style={styles.label}>Selecciona patente</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={patenteSeleccionada}
          onValueChange={(value) => {
            setPatenteSeleccionada(value);
            setErrores((prev) => ({ ...prev, patente: '' }));
            // Cargar cupos del vehículo seleccionado
            const vehiculoSeleccionado = vehiculos.find((v) => v.patente === value);
            if (vehiculoSeleccionado?.cupos) {
              setCupos(vehiculoSeleccionado.cupos.toString());
            }
          }}
          style={styles.picker}
        >
          {patentes.length > 0 ? (
            patentes.map((patente, index) => (
              <Picker.Item key={index} label={patente} value={patente} />
            ))
          ) : (
            <Picker.Item label="No hay vehículos registrados" value="" />
          )}
        </Picker>
      </View>
      {errores.patente ? <Text style={styles.errorText}>{errores.patente}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Colegio"
        value={colegio}
        onChangeText={setColegio}
      />
      {errores.colegio ? <Text style={styles.errorText}>{errores.colegio}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Dirección del colegio"
        value={direccionColegio}
        onChangeText={setDireccionColegio}
      />
      {errores.direccionColegio ? <Text style={styles.errorText}>{errores.direccionColegio}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Cupos disponibles (1-30)"
        value={cupos}
        onChangeText={setCupos}
        keyboardType="numeric"
        maxLength={3}
      />
      {errores.cupos ? <Text style={styles.errorText}>{errores.cupos}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Precio"
        value={precio}
        keyboardType="numeric"
        onChangeText={setPrecio}
      />
      {errores.precio ? <Text style={styles.errorText}>{errores.precio}</Text> : null}

      <Text style={styles.label}>Selecciona Región</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={regionSeleccionada}
          onValueChange={(value) => {
            setRegionSeleccionada(value);
            setComuna(''); // Limpiar comuna cuando cambia la región
            setErrores((prev) => ({ ...prev, region: '', comuna: '' }));
          }}
          style={styles.picker}
          itemStyle={Platform.OS === 'ios' ? styles.pickerItem : undefined}
        >
          <Picker.Item label="Selecciona una región..." value="" color="#999" />
          {REGIONES.map((region, index) => (
            <Picker.Item key={index} label={region} value={region} />
          ))}
        </Picker>
      </View>
      {errores.region ? <Text style={styles.errorText}>{errores.region}</Text> : null}

      {regionSeleccionada && (
        <>
          <Text style={styles.label}>Selecciona Comuna</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={comuna}
              onValueChange={(value) => {
                setComuna(value);
                setErrores((prev) => ({ ...prev, comuna: '' }));
              }}
              style={styles.picker}
              itemStyle={Platform.OS === 'ios' ? styles.pickerItem : undefined}
            >
              <Picker.Item label="Selecciona una comuna..." value="" color="#999" />
              {REGIONES_Y_COMUNAS[regionSeleccionada]?.map((comunaItem, index) => (
                <Picker.Item key={index} label={comunaItem} value={comunaItem} />
              ))}
            </Picker>
          </View>
          {errores.comuna ? <Text style={styles.errorText}>{errores.comuna}</Text> : null}
        </>
      )}

      {modoEdicion ? (
        <View style={styles.buttonsContainer}>
          <Pressable 
            style={[styles.button, styles.buttonCancelar]} 
            onPress={() => {
              setModoEdicion(false);
              setFurgonExistente(null);
              router.replace('/(tabs)/conductor/promocionar-furgon');
            }}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Cancelar</Text>
          </Pressable>
          <Pressable 
            style={[styles.button, styles.buttonGuardar]} 
            onPress={manejarEditarFurgon} 
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Guardar Cambios</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.button} onPress={manejarPublicarFurgon} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Publicar Furgón</Text>
          )}
        </Pressable>
      )}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 100, // espacio para flecha y título
    alignItems: 'center',
    paddingBottom: 40,
  },
  scrollFormContent: {
    padding: 20,
    paddingTop: 100, // espacio para flecha y título
    paddingBottom: 40,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
    padding: 5,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#127067',
    textAlign: 'center',
    alignSelf: 'center',
    marginLeft: 20,
    marginBottom: 20,
  },
  profileImageContainer: {
    backgroundColor: '#e6e6e6',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  profileImage: {
    width: 50,
    height: 50,
  },
  input: {
    width: '90%',
    borderColor: '#127067',
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  label: {
    fontSize: 16,
    color: '#333',
    alignSelf: 'flex-start',
    marginBottom: 5,
    marginLeft: 20,
  },
  pickerContainer: {
    width: '90%',
    backgroundColor: '#fff',
    borderColor: '#127067',
    borderWidth: 1.5,
    borderRadius: 10,
    marginBottom: 10,
  },
  picker: {
    height: 50,
    width: '100%',
    color: '#333',
  },
  pickerItem: {
    fontSize: 16,
  },
  button: {
    backgroundColor: '#127067',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 20,
    marginTop: 10,
    width: 150,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    fontSize: 13,
    marginBottom: 5,
    alignSelf: 'flex-start',
    marginLeft: 25,
  },
  furgonInfoContainer: {
    width: '90%',
    backgroundColor: '#F5F7F8',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#127067',
  },
  furgonInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#127067',
    marginBottom: 15,
    textAlign: 'center',
  },
  furgonInfoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  furgonInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  furgonInfoValue: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    textAlign: 'right',
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: 15,
    width: '90%',
    justifyContent: 'center',
  },
  buttonEditar: {
    backgroundColor: '#127067',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  buttonCancelar: {
    backgroundColor: '#6c757d',
    flex: 1,
  },
  buttonGuardar: {
    backgroundColor: '#127067',
    flex: 1,
  },
});
