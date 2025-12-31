import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

type ConnState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';
type LogKind = 'IN' | 'OUT' | 'INFO' | 'ERROR';

type LogItem = {
  id: string;
  ts: number;
  kind: LogKind;
  text: string;
};

function formatTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function safeStringify(data: unknown) {
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function WebSocketInspectorScreen() {
  const insets = useSafeAreaInsets();

  const wsRef = useRef<WebSocket | null>(null);
  const manuallyDisconnectedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [connState, setConnState] = useState<ConnState>('DISCONNECTED');
  const [url, setUrl] = useState('wss://echo.websocket.events');
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [reconnectDelayMs, setReconnectDelayMs] = useState(1500);

  const [filterText, setFilterText] = useState('');
  const [showIn, setShowIn] = useState(true);
  const [showOut, setShowOut] = useState(true);
  const [showInfo, setShowInfo] = useState(true);
  const [showError, setShowError] = useState(true);

  const [outgoingText, setOutgoingText] = useState('');
  const [logs, setLogs] = useState<LogItem[]>([]);

  const listRef = useRef<FlatList<LogItem> | null>(null);

  const addLog = (kind: LogKind, text: string) => {
    setLogs(prev => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return [{id, ts: Date.now(), kind, text}, ...prev];
    });
  };

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const closeSocket = (reason: string) => {
    clearReconnectTimer();
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      try {
        ws.close(1000, reason);
      } catch {
        // ignore
      }
    }
  };

  const scheduleReconnect = () => {
    if (!autoReconnect) return;
    if (manuallyDisconnectedRef.current) return;
    if (reconnectTimerRef.current) return;

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, reconnectDelayMs);
  };

  const connect = () => {
    const trimmed = url.trim();
    if (!trimmed) {
      addLog('ERROR', 'URL vazia.');
      return;
    }
    if (!/^wss?:\/\//i.test(trimmed)) {
      addLog('ERROR', 'A URL precisa começar com ws:// ou wss://');
      return;
    }
    if (connState === 'CONNECTING' || connState === 'CONNECTED') return;

    manuallyDisconnectedRef.current = false;
    clearReconnectTimer();

    setConnState('CONNECTING');
    addLog('INFO', `Conectando em ${trimmed} ...`);

    let ws: WebSocket;
    try {
      ws = new WebSocket(trimmed);
    } catch (e) {
      setConnState('DISCONNECTED');
      addLog('ERROR', `Falha ao criar WebSocket: ${safeStringify(e)}`);
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      setConnState('CONNECTED');
      addLog('INFO', 'Conectado.');
    };

    ws.onmessage = event => {
      addLog('IN', safeStringify(event.data));
    };

    ws.onerror = event => {
      addLog('ERROR', `Erro no socket: ${safeStringify(event)}`);
    };

    ws.onclose = event => {
      wsRef.current = null;
      setConnState('DISCONNECTED');
      addLog(
        'INFO',
        `Desconectado. code=${String(event.code)} reason=${String(
          event.reason || '',
        )}`,
      );
      scheduleReconnect();
    };
  };

  const disconnect = () => {
    manuallyDisconnectedRef.current = true;
    addLog('INFO', 'Desconectando (manual)...');
    setConnState('DISCONNECTED');
    closeSocket('manual-disconnect');
  };

  const sendMessage = () => {
    const ws = wsRef.current;
    if (!ws || connState !== 'CONNECTED') {
      addLog('ERROR', 'Não conectado.');
      return;
    }
    const msg = outgoingText;
    if (!msg.trim()) return;

    try {
      ws.send(msg);
      addLog('OUT', msg);
      setOutgoingText('');
    } catch (e) {
      addLog('ERROR', `Falha ao enviar: ${safeStringify(e)}`);
    }
  };

  useEffect(() => {
    return () => {
      manuallyDisconnectedRef.current = true;
      clearReconnectTimer();
      closeSocket('unmount');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleLogs = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return logs.filter(l => {
      const allowed =
        (l.kind === 'IN' && showIn) ||
        (l.kind === 'OUT' && showOut) ||
        (l.kind === 'INFO' && showInfo) ||
        (l.kind === 'ERROR' && showError);
      if (!allowed) return false;
      if (!q) return true;
      return l.text.toLowerCase().includes(q);
    });
  }, [filterText, logs, showError, showIn, showInfo, showOut]);

  useEffect(() => {
    // ajuda a manter no topo (logs são prepend)
    listRef.current?.scrollToOffset({offset: 0, animated: true});
  }, [visibleLogs.length]);

  const statusColor =
    connState === 'CONNECTED'
      ? '#16a34a'
      : connState === 'CONNECTING'
        ? '#d97706'
        : '#6b7280';

  return (
    <KeyboardAvoidingView
      style={[styles.root, {paddingTop: insets.top}]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.title}>WebSocket Inspector (Android)</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, {backgroundColor: statusColor}]} />
            <Text style={styles.statusText}>{connState}</Text>
          </View>
        </View>

        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          placeholder="ws:// ou wss://"
          placeholderTextColor="#9ca3af"
          style={styles.urlInput}
        />

        <View style={styles.buttonRow}>
          <Pressable
            onPress={connect}
            disabled={connState !== 'DISCONNECTED'}
            style={({pressed}) => [
              styles.btn,
              styles.btnPrimary,
              connState !== 'DISCONNECTED' && styles.btnDisabled,
              pressed && styles.btnPressed,
            ]}>
            <Text style={styles.btnText}>Conectar</Text>
          </Pressable>

          <Pressable
            onPress={disconnect}
            disabled={connState === 'DISCONNECTED'}
            style={({pressed}) => [
              styles.btn,
              styles.btnDanger,
              connState === 'DISCONNECTED' && styles.btnDisabled,
              pressed && styles.btnPressed,
            ]}>
            <Text style={styles.btnText}>Desconectar</Text>
          </Pressable>

          <Pressable
            onPress={() => setLogs([])}
            style={({pressed}) => [
              styles.btn,
              styles.btnSecondary,
              pressed && styles.btnPressed,
            ]}>
            <Text style={styles.btnText}>Limpar</Text>
          </Pressable>
        </View>

        <View style={styles.switchRow}>
          <View style={styles.switchItem}>
            <Text style={styles.switchLabel}>Auto-reconectar</Text>
            <Switch value={autoReconnect} onValueChange={setAutoReconnect} />
          </View>
          <View style={styles.switchItem}>
            <Text style={styles.switchLabel}>Delay (ms)</Text>
            <TextInput
              value={String(reconnectDelayMs)}
              onChangeText={t => {
                const n = Number(t.replace(/[^\d]/g, ''));
                if (Number.isFinite(n)) setReconnectDelayMs(Math.max(0, n));
              }}
              keyboardType="numeric"
              style={styles.delayInput}
              placeholder="1500"
              placeholderTextColor="#9ca3af"
            />
          </View>
        </View>

        <View style={styles.filterRow}>
          <TextInput
            value={filterText}
            onChangeText={setFilterText}
            placeholder="Filtrar logs..."
            placeholderTextColor="#9ca3af"
            style={styles.filterInput}
          />
        </View>

        <View style={styles.togglesRow}>
          <Pressable
            onPress={() => setShowIn(v => !v)}
            style={[
              styles.toggle,
              showIn ? styles.toggleOn : styles.toggleOff,
            ]}>
            <Text style={styles.toggleText}>IN</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowOut(v => !v)}
            style={[
              styles.toggle,
              showOut ? styles.toggleOn : styles.toggleOff,
            ]}>
            <Text style={styles.toggleText}>OUT</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowInfo(v => !v)}
            style={[
              styles.toggle,
              showInfo ? styles.toggleOn : styles.toggleOff,
            ]}>
            <Text style={styles.toggleText}>INFO</Text>
          </Pressable>
          <Pressable
            onPress={() => setShowError(v => !v)}
            style={[
              styles.toggle,
              showError ? styles.toggleOn : styles.toggleOff,
            ]}>
            <Text style={styles.toggleText}>ERRO</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.listWrap}>
        <FlatList
          ref={r => {
            listRef.current = r;
          }}
          data={visibleLogs}
          keyExtractor={item => item.id}
          inverted={false}
          contentContainerStyle={styles.listContent}
          renderItem={({item}) => (
            <View style={styles.logRow}>
              <Text style={styles.logMeta}>
                {formatTime(item.ts)} {item.kind}
              </Text>
              <Text
                selectable
                style={[
                  styles.logText,
                  item.kind === 'IN' && styles.logIn,
                  item.kind === 'OUT' && styles.logOut,
                  item.kind === 'ERROR' && styles.logError,
                ]}>
                {item.text}
              </Text>
            </View>
          )}
        />
      </View>

      <View style={[styles.footer, {paddingBottom: Math.max(insets.bottom, 12)}]}>
        <TextInput
          value={outgoingText}
          onChangeText={setOutgoingText}
          placeholder="Mensagem para enviar..."
          placeholderTextColor="#9ca3af"
          style={styles.sendInput}
          multiline
        />
        <Pressable
          onPress={sendMessage}
          disabled={connState !== 'CONNECTED'}
          style={({pressed}) => [
            styles.btn,
            styles.btnPrimary,
            connState !== 'CONNECTED' && styles.btnDisabled,
            pressed && styles.btnPressed,
          ]}>
          <Text style={styles.btnText}>Enviar</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0b1220',
  },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  statusText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '600',
  },
  urlInput: {
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e5e7eb',
    backgroundColor: '#0f172a',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
  },
  btnSecondary: {
    backgroundColor: '#334155',
  },
  btnDanger: {
    backgroundColor: '#dc2626',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    transform: [{scale: 0.98}],
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  switchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  switchLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  delayInput: {
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: 90,
    color: '#e5e7eb',
    backgroundColor: '#0f172a',
    textAlign: 'center',
  },
  filterRow: {
    flexDirection: 'row',
  },
  filterInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e5e7eb',
    backgroundColor: '#0f172a',
  },
  togglesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  toggleOn: {
    backgroundColor: '#111827',
  },
  toggleOff: {
    backgroundColor: '#0f172a',
    opacity: 0.6,
  },
  toggleText: {
    color: '#e5e7eb',
    fontWeight: '800',
    fontSize: 12,
  },
  listWrap: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#111827',
  },
  listContent: {
    padding: 12,
    gap: 10,
  },
  logRow: {
    gap: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#111827',
  },
  logMeta: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
  },
  logText: {
    color: '#e5e7eb',
    fontSize: 12,
    lineHeight: 16,
  },
  logIn: {
    color: '#a7f3d0',
  },
  logOut: {
    color: '#bfdbfe',
  },
  logError: {
    color: '#fecaca',
  },
  footer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
    backgroundColor: '#0b1220',
  },
  sendInput: {
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e5e7eb',
    backgroundColor: '#0f172a',
  },
});


