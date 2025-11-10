import { db } from '@/firebaseConfig';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
} from 'react-native';

interface DocumentData {
  id: string;
  data: any;
}

export default function AdminViewerScreen() {
  const router = useRouter();
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [loading, setLoading] = useState(false);
  const [collections] = useState<string[]>([
    'usuarios',
    'Hijos',
    'lista_pasajeros',
    'Postulaciones',
    'Alertas',
    'Furgones',
    'Vehiculos',
    'MensajesChat',
  ]);

  const loadDocuments = async (collectionName: string) => {
    setLoading(true);
    setSelectedCollection(collectionName);
    setDocuments([]);

    try {
      const collectionRef = collection(db, collectionName);
      const q = query(collectionRef, limit(100)); // Limitar a 100 documentos
      const snapshot = await getDocs(q);

      const docs: DocumentData[] = [];
      snapshot.forEach((doc) => {
        docs.push({
          id: doc.id,
          data: doc.data(),
        });
      });

      setDocuments(docs);
    } catch (error) {
      console.error('Error al cargar documentos:', error);
      Alert.alert('Error', 'No se pudieron cargar los documentos.');
    } finally {
      setLoading(false);
    }
  };

  const renderCollectionButton = (collectionName: string) => (
    <TouchableHighlight
      key={collectionName}
      style={[
        styles.collectionButton,
        selectedCollection === collectionName && styles.collectionButtonActive,
      ]}
      underlayColor="#0e5b52"
      onPress={() => loadDocuments(collectionName)}
    >
      <Text
        style={[
          styles.collectionButtonText,
          selectedCollection === collectionName && styles.collectionButtonTextActive,
        ]}
      >
        {collectionName}
      </Text>
    </TouchableHighlight>
  );

  const renderDocument = ({ item }: { item: DocumentData }) => (
    <View style={styles.documentCard}>
      <Text style={styles.documentId}>ID: {item.id}</Text>
      <ScrollView style={styles.documentDataContainer} nestedScrollEnabled>
        <Text style={styles.documentData}>
          {JSON.stringify(item.data, null, 2)}
        </Text>
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <Text style={styles.title}>Visor de Base de Datos</Text>
      <Text style={styles.subtitle}>Selecciona una colección para ver sus documentos</Text>

      <View style={styles.collectionsContainer}>
        {collections.map(renderCollectionButton)}
      </View>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#127067" />
          <Text style={styles.loadingText}>Cargando documentos...</Text>
        </View>
      )}

      {!loading && selectedCollection && (
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsTitle}>
            {documents.length} documento(s) en "{selectedCollection}"
          </Text>
          <FlatList
            data={documents}
            renderItem={renderDocument}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={true}
          />
        </View>
      )}

      {!loading && !selectedCollection && (
        <View style={styles.emptyContainer}>
          <Ionicons name="folder-outline" size={64} color="#999" />
          <Text style={styles.emptyText}>Selecciona una colección para comenzar</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F8',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#127067',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  collectionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  collectionButton: {
    backgroundColor: '#127067',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    marginRight: 8,
  },
  collectionButtonActive: {
    backgroundColor: '#0e5b52',
    borderWidth: 2,
    borderColor: '#127067',
  },
  collectionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  collectionButtonTextActive: {
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 16,
  },
  resultsContainer: {
    flex: 1,
    marginTop: 10,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  listContent: {
    paddingBottom: 20,
  },
  documentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  documentId: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#127067',
    marginBottom: 8,
  },
  documentDataContainer: {
    maxHeight: 300,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    padding: 12,
  },
  documentData: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    color: '#999',
    fontSize: 16,
    textAlign: 'center',
  },
});

