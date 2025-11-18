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
  const [precio, setPrecio] = useState('');
  const [regionSeleccionada, setRegionSeleccionada] = useState('');
  const [comuna, setComuna] = useState('');
  const [patenteSeleccionada, setPatenteSeleccionada] = useState('');
  const [patentes, setPatentes] = useState<string[]>([]);
  const [vehiculos, setVehiculos] = useState<Array<{ patente: string; cupos?: number }>>([]);
  const [rutUsuario, setRutUsuario] = useState('');
  const [loading, setLoading] = useState(false);
  const [cupos, setCupos] = useState('');

  const [errores, setErrores] = useState({
    nombre: '',
    colegio: '',
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
        console.error('Error al obtener patentes:', error);
        Alert.alert('Error', 'No se pudieron cargar los vehículos.');
      }
    };

    obtenerDatos();
  }, []);

  const manejarPublicarFurgon = async () => {
    const cuposNumero = parseInt(cupos, 10);
    const nuevosErrores = {
      nombre: !nombre ? 'Ingresa el nombre' : '',
      colegio: !colegio ? 'Ingresa el colegio' : '',
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

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={handleVolver}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <Text style={styles.title}>Publicar Furgón</Text>

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

      <TextInput
        style={styles.input}
        placeholder="Colegio"
        value={colegio}
        onChangeText={setColegio}
      />
      {errores.colegio ? <Text style={styles.errorText}>{errores.colegio}</Text> : null}

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

      <TextInput
        style={styles.input}
        placeholder="Cupos disponibles (1-30)"
        value={cupos}
        onChangeText={setCupos}
        keyboardType="numeric"
        maxLength={3}
      />
      {errores.cupos ? <Text style={styles.errorText}>{errores.cupos}</Text> : null}

      <Text style={styles.label}>Selecciona patente</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={patenteSeleccionada}
          onValueChange={(value) => {
            setPatenteSeleccionada(value);
            // Cargar cupos del vehículo seleccionado
            const vehiculoSeleccionado = vehiculos.find((v) => v.patente === value);
            if (vehiculoSeleccionado?.cupos) {
              setCupos(vehiculoSeleccionado.cupos.toString());
            } else {
              setCupos('');
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

      <Pressable style={styles.button} onPress={manejarPublicarFurgon} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Publicar</Text>
        )}
      </Pressable>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 100, // espacio para flecha y título
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
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
});
