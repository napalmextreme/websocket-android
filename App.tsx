import React, {useState} from 'react';
import {Pressable, StatusBar, StyleSheet, Text, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {BrowserSnifferScreen} from './src/screens/BrowserSnifferScreen';
import {WebSocketInspectorScreen} from './src/screens/WebSocketInspectorScreen';

export default function App() {
  const [tab, setTab] = useState<'BROWSER' | 'SOCKET'>('BROWSER');
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        <View style={styles.tabBar}>
          <Pressable
            onPress={() => setTab('BROWSER')}
            style={[styles.tab, tab === 'BROWSER' ? styles.tabOn : styles.tabOff]}>
            <Text style={styles.tabText}>Navegador</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('SOCKET')}
            style={[styles.tab, tab === 'SOCKET' ? styles.tabOn : styles.tabOff]}>
            <Text style={styles.tabText}>Socket</Text>
          </Pressable>
        </View>
        <View style={styles.body}>
          {tab === 'BROWSER' ? <BrowserSnifferScreen /> : <WebSocketInspectorScreen />}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0b1220'},
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0b1220',
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f2937',
    alignItems: 'center',
  },
  tabOn: {backgroundColor: '#111827'},
  tabOff: {backgroundColor: '#0f172a', opacity: 0.75},
  tabText: {color: '#e5e7eb', fontWeight: '900', fontSize: 12},
  body: {flex: 1},
});
