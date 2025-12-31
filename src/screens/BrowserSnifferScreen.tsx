import React, {useMemo, useRef, useState} from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  NativeModules,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import WebView, {WebViewMessageEvent} from 'react-native-webview';

type WsState = 'OPEN' | 'CREATING' | 'CLOSED' | 'ERROR';

type ConnItem = {
  id: string;
  url: string;
  state: WsState;
  ts: number;
};

type IframeItem = {
  id: string;
  src: string;
  srcAttr: string;
  dataSrc: string;
  name: string;
  title: string;
  sandbox: string;
  allow: string;
  width: number;
  height: number;
  foundAt: number;
  fromUrl: string;
};

type WsMsg = {dir: 'IN' | 'OUT'; ts: number; data: string};

function formatTime(ts: number) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function normalizeUrl(input: string) {
  const t = input.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^file:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

const WsRegistry: {
  upsertConnection: (id: string, url: string, state: string, updatedAt: number) => void;
  removeConnection: (id: string) => void;
  clear: () => void;
  addMessage: (id: string, dir: string, ts: number, data: string) => void;
  clearMessages: (id: string) => void;
  getMessages: (id: string) => Promise<Array<{dir: string; ts: number; data: string}>>;
  getConnections: () => Promise<Array<{id: string; url: string; state: string; updatedAt: number}>>;
} | null = (NativeModules as any).WsRegistry ?? null;

const injectedHook = `
(function () {
  if (window.__WS_SNIFFER_INSTALLED__) return;
  window.__WS_SNIFFER_INSTALLED__ = true;

  function post(kind, payload) {
    try {
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
        __ws_sniffer: true,
        kind: kind,
        payload: payload || {}
      }));
    } catch (e) {}
  }

  function toText(v) {
    try {
      if (typeof v === 'string') return v;
      if (v && typeof v === 'object' && (v.byteLength != null || v.size != null)) return '[binary]';
      return JSON.stringify(v);
    } catch (e) {
      try { return String(v); } catch (e2) { return '[unserializable]'; }
    }
  }

  var OriginalWebSocket = window.WebSocket;
  if (!OriginalWebSocket) {
    post('WS_ERROR', { message: 'WebSocket não disponível nesta página.' });
    return;
  }

  window.WebSocket = function (url, protocols) {
    var ws;
    try {
      ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);
    } catch (e) {
      post('WS_ERROR', { url: String(url), message: 'Falha ao criar WebSocket', error: toText(e) });
      throw e;
    }

    var id = Math.random().toString(16).slice(2) + '-' + Date.now();
    ws.__ws_sniffer_id = id;
    ws.__ws_sniffer_url = String(url);

    post('WS_OPEN', { id: id, url: String(url), phase: 'creating' });

    var origSend = ws.send;
    ws.send = function (data) {
      post('WS_SEND', { id: id, url: String(url), data: toText(data) });
      return origSend.apply(ws, arguments);
    };

    ws.addEventListener('open', function () {
      post('WS_OPEN', { id: id, url: String(url), phase: 'open' });
    });
    ws.addEventListener('message', function (ev) {
      post('WS_MSG', { id: id, url: String(url), data: toText(ev && ev.data) });
    });
    ws.addEventListener('close', function (ev) {
      post('WS_CLOSE', { id: id, url: String(url), code: ev && ev.code, reason: ev && ev.reason });
    });
    ws.addEventListener('error', function () {
      post('WS_ERROR', { id: id, url: String(url), message: 'WebSocket error event' });
    });

    return ws;
  };
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;

  post('NAV', { message: 'Hook do WebSocket instalado.' });

  // ---- IFRAME discovery (helps when WS is created inside cross-origin iframe) ----
  var lastIframeSig = '';
  function scanIframes() {
    try {
      if (!document || !document.querySelectorAll) return;
      var frames = Array.prototype.slice.call(document.querySelectorAll('iframe'));
      var items = frames.map(function (f, idx) {
        try {
          var src = '';
          try { src = (f && f.src) ? String(f.src) : ''; } catch (e1) { src = ''; }
          var srcAttr = '';
          try { srcAttr = (f && f.getAttribute) ? String(f.getAttribute('src') || '') : ''; } catch (e2) { srcAttr = ''; }
          var dataSrc = '';
          try { dataSrc = (f && f.getAttribute) ? String(f.getAttribute('data-src') || '') : ''; } catch (e3) { dataSrc = ''; }
          var name = '';
          try { name = (f && f.name) ? String(f.name) : ''; } catch (e4) { name = ''; }
          var title = '';
          try { title = (f && f.title) ? String(f.title) : ''; } catch (e5) { title = ''; }
          var sandbox = '';
          try { sandbox = (f && f.getAttribute) ? String(f.getAttribute('sandbox') || '') : ''; } catch (e6) { sandbox = ''; }
          var allow = '';
          try { allow = (f && f.getAttribute) ? String(f.getAttribute('allow') || '') : ''; } catch (e7) { allow = ''; }
          var rect = null;
          try { rect = (f && f.getBoundingClientRect) ? f.getBoundingClientRect() : null; } catch (e8) { rect = null; }
          var w = rect ? Math.round(rect.width) : 0;
          var h = rect ? Math.round(rect.height) : 0;
          return {
            idx: idx,
            src: src,
            srcAttr: srcAttr,
            dataSrc: dataSrc,
            name: name,
            title: title,
            sandbox: sandbox,
            allow: allow,
            width: w,
            height: h
          };
        } catch (e) {
          return { idx: idx, src: '', srcAttr: '', dataSrc: '', name: '', title: '', sandbox: '', allow: '', width: 0, height: 0 };
        }
      });

      // signature to avoid spamming RN
      var sig = items
        .map(function (it) { return [it.src, it.srcAttr, it.dataSrc, it.name, it.title, it.sandbox, it.allow, it.width, it.height].join('~'); })
        .sort()
        .join('|');
      if (sig === lastIframeSig) return;
      lastIframeSig = sig;
      post('IFRAME_LIST', { fromUrl: String(location && location.href ? location.href : ''), frames: items });
    } catch (e) {}
  }

  try {
    scanIframes();
    setInterval(scanIframes, 1200);
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { scanIframes(); });
      mo.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true });
    }
  } catch (e) {}
})(); true;
`;

export function BrowserSnifferScreen() {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView | null>(null);

  const [address, setAddress] = useState('https://google.com');
  const [currentUrl, setCurrentUrl] = useState('https://google.com');

  const [connections, setConnections] = useState<Record<string, ConnItem>>({});
  const [iframes, setIframes] = useState<Record<string, IframeItem>>({});
  const [selectedConn, setSelectedConn] = useState<ConnItem | null>(null);
  const [selectedMsgs, setSelectedMsgs] = useState<WsMsg[]>([]);

  const upsertConn = (id: string, url: string, state: WsState) => {
    const now = Date.now();
    setConnections(prev => ({
      ...prev,
      [id]: {id, url, state, ts: now},
    }));
    WsRegistry?.upsertConnection(id, url, state, now);
  };

  const openConnDetails = async (conn: ConnItem) => {
    setSelectedConn(conn);
    if (!WsRegistry) {
      setSelectedMsgs([]);
      return;
    }
    try {
      const msgs = await WsRegistry.getMessages(conn.id);
      setSelectedMsgs(
        msgs.map(m => ({
          dir: (String(m.dir).toUpperCase() === 'OUT' ? 'OUT' : 'IN') as 'IN' | 'OUT',
          ts: Number(m.ts || 0),
          data: String(m.data ?? ''),
        })),
      );
    } catch {
      setSelectedMsgs([]);
    }
  };

  const removeConn = (id: string) => {
    setConnections(prev => {
      if (!prev[id]) return prev;
      const next = {...prev};
      delete next[id];
      return next;
    });
    WsRegistry?.removeConnection(id);
  };

  const onSubmitAddress = () => {
    const next = normalizeUrl(address);
    if (!next) return;
    setCurrentUrl(next);
  };

  const onWebMessage = (event: WebViewMessageEvent) => {
    const raw = event.nativeEvent.data;
    const data = safeJsonParse<{
      __ws_sniffer?: boolean;
      kind?: string;
      payload?: any;
    }>(raw);
    if (!data || !data.__ws_sniffer || !data.kind) return;

    const p = data.payload || {};
    if (data.kind === 'IFRAME_LIST') {
      const fromUrl = String(p.fromUrl || '');
      const frames: any[] = Array.isArray(p.frames) ? p.frames : [];
      const now = Date.now();
      setIframes(prev => {
        const next = {...prev};
        frames.forEach((f: any, idx: number) => {
          const src = String(f?.src || '');
          const srcAttr = String(f?.srcAttr || '');
          const dataSrc = String(f?.dataSrc || '');
          const name = String(f?.name || '');
          const title = String(f?.title || '');
          const sandbox = String(f?.sandbox || '');
          const allow = String(f?.allow || '');
          const width = Number(f?.width || 0);
          const height = Number(f?.height || 0);

          // unique id even if src is empty/about:blank
          const id = `${fromUrl}::${idx}::${src || srcAttr || dataSrc || 'NO_SRC'}::${width}x${height}::${name}::${title}`;
          next[id] = {
            id,
            src,
            srcAttr,
            dataSrc,
            name,
            title,
            sandbox,
            allow,
            width: Number.isFinite(width) ? width : 0,
            height: Number.isFinite(height) ? height : 0,
            foundAt: now,
            fromUrl,
          };
        });
        return next;
      });
      return;
    }

    const id = String(p.id || '');
    const url = String(p.url || '');
    if (!id || !url) return;

    if (data.kind === 'WS_OPEN') {
      const phase = String(p.phase || '');
      upsertConn(id, url, phase === 'creating' ? 'CREATING' : 'OPEN');
      return;
    }
    if (data.kind === 'WS_SEND') {
      const payload = String(p.data ?? '');
      WsRegistry?.addMessage(id, 'OUT', Date.now(), payload);
      return;
    }
    if (data.kind === 'WS_MSG') {
      const payload = String(p.data ?? '');
      WsRegistry?.addMessage(id, 'IN', Date.now(), payload);
      return;
    }
    if (data.kind === 'WS_CLOSE') {
      removeConn(id);
      return;
    }
    if (data.kind === 'WS_ERROR') {
      upsertConn(id, url, 'ERROR');
      return;
    }
  };

  const headerRight = useMemo(() => {
    return (
      <View style={styles.headerBtns}>
        <Pressable
          onPress={() => webRef.current?.goBack()}
          style={({pressed}) => [styles.hBtn, pressed && styles.hBtnPressed]}>
          <Text style={styles.hBtnText}>{'<'}</Text>
        </Pressable>
        <Pressable
          onPress={() => webRef.current?.goForward()}
          style={({pressed}) => [styles.hBtn, pressed && styles.hBtnPressed]}>
          <Text style={styles.hBtnText}>{'>'}</Text>
        </Pressable>
        <Pressable
          onPress={() => webRef.current?.reload()}
          style={({pressed}) => [styles.hBtn, pressed && styles.hBtnPressed]}>
          <Text style={styles.hBtnText}>R</Text>
        </Pressable>
      </View>
    );
  }, []);

  return (
    <KeyboardAvoidingView
      style={[styles.root, {paddingTop: insets.top}]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Text style={styles.title}>Navegador + Detector de WebSocket</Text>
        {headerRight}
      </View>

      <View style={styles.addressBar}>
        <TextInput
          value={address}
          onChangeText={setAddress}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          placeholder="https://google.com"
          placeholderTextColor="#9ca3af"
          style={styles.addressInput}
          onSubmitEditing={onSubmitAddress}
          returnKeyType="go"
        />
        <Pressable
          onPress={onSubmitAddress}
          style={({pressed}) => [styles.goBtn, pressed && styles.goBtnPressed]}>
          <Text style={styles.goBtnText}>IR</Text>
        </Pressable>
      </View>

      <View style={styles.webWrap}>
        <WebView
          ref={r => {
            webRef.current = r;
          }}
          source={{uri: currentUrl}}
          javaScriptEnabled
          domStorageEnabled
          injectedJavaScriptForMainFrameOnly={false}
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
          injectedJavaScriptBeforeContentLoaded={injectedHook}
          onMessage={onWebMessage}
          onNavigationStateChange={nav => {
            if (nav.url && nav.url !== address) setAddress(nav.url);
          }}
        />
      </View>

      <View style={[styles.logsHeader, {paddingBottom: Math.max(insets.bottom, 10)}]}>
        <Text style={styles.logsTitle}>
          Iframes ({Object.keys(iframes).length}) • Conexões WebSocket ({Object.keys(connections).length})
        </Text>
        <Pressable
          onPress={() => {
            setConnections({});
            setIframes({});
            WsRegistry?.clear();
          }}
          style={({pressed}) => [styles.clearBtn, pressed && styles.clearBtnPressed]}>
          <Text style={styles.clearBtnText}>Limpar</Text>
        </Pressable>
      </View>

      <View style={styles.logsWrap}>
        <FlatList
          data={[
            ...Object.values(iframes)
              .sort((a, b) => b.foundAt - a.foundAt)
              .map(i => ({type: 'IFRAME' as const, key: i.id, iframe: i})),
            ...Object.values(connections)
              .sort((a, b) => b.ts - a.ts)
              .map(c => ({type: 'WS' as const, key: c.id, conn: c})),
          ]}
          keyExtractor={i => i.key}
          contentContainerStyle={styles.logsContent}
          renderItem={({item}) => {
            if (item.type === 'IFRAME') {
              const f = item.iframe;
              const best =
                (f.src && f.src !== 'about:blank' ? f.src : '') ||
                (f.srcAttr && f.srcAttr !== 'about:blank' ? f.srcAttr : '') ||
                (f.dataSrc && f.dataSrc !== 'about:blank' ? f.dataSrc : '');
              const subtitleParts = [
                f.width || f.height ? `${f.width}x${f.height}` : '',
                f.sandbox ? `sandbox=${f.sandbox}` : '',
                f.allow ? `allow=${f.allow}` : '',
                f.name ? `name=${f.name}` : '',
                f.title ? `title=${f.title}` : '',
              ].filter(Boolean);
              const subtitle = subtitleParts.join(' • ');

              return (
                <Pressable
                  onPress={() => {
                    // abrir iframe direto (vira frame principal, aí o hook captura WS dele)
                    if (!best) return;
                    setAddress(best);
                    setCurrentUrl(best);
                  }}
                  style={({pressed}) => [styles.logRow, pressed && styles.rowPressed]}>
                  <Text style={styles.logMeta}>
                    {formatTime(f.foundAt)} IFRAME (toque para abrir)
                  </Text>
                  <Text selectable style={[styles.logText, styles.cMsg]}>
                    {best || f.src || f.srcAttr || f.dataSrc || '(iframe sem src)'}
                  </Text>
                  {!!subtitle && <Text style={styles.iframeSub}>{subtitle}</Text>}
                </Pressable>
              );
            }
            const c = item.conn;
            return (
              <Pressable
                onPress={() => openConnDetails(c)}
                style={({pressed}) => [styles.logRow, pressed && styles.rowPressed]}>
                <Text style={styles.logMeta}>
                  {formatTime(c.ts)} {c.state} (toque para ver mensagens)
                </Text>
                <Text
                  selectable
                  style={[
                    styles.logText,
                    c.state === 'OPEN' && styles.cOpen,
                    c.state === 'CREATING' && styles.cMsg,
                    c.state === 'ERROR' && styles.cErr,
                  ]}>
                  {c.url}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {!!selectedConn && (
        <View style={[styles.overlay, {paddingBottom: Math.max(insets.bottom, 12)}]}>
          <View style={styles.overlayHeader}>
            <View style={styles.overlayHeaderLeft}>
              <Text style={styles.overlayTitle}>Mensagens ({selectedMsgs.length})</Text>
              <Text style={styles.overlaySub} numberOfLines={1}>
                {selectedConn.url}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                setSelectedConn(null);
                setSelectedMsgs([]);
              }}
              style={({pressed}) => [styles.overlayBtn, pressed && styles.rowPressed]}>
              <Text style={styles.overlayBtnText}>Fechar</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (WsRegistry) WsRegistry.clearMessages(selectedConn.id);
                setSelectedMsgs([]);
              }}
              style={({pressed}) => [styles.overlayBtn, pressed && styles.rowPressed]}>
              <Text style={styles.overlayBtnText}>Limpar</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.overlayBody} contentContainerStyle={styles.overlayBodyContent}>
            {selectedMsgs.map((m, idx) => (
              <View key={`${idx}-${m.ts}`} style={styles.msgRow}>
                <Text style={styles.msgMeta}>
                  {formatTime(m.ts)} {m.dir}
                </Text>
                <Text
                  selectable
                  style={[styles.msgText, m.dir === 'IN' ? styles.msgIn : styles.msgOut]}>
                  {m.data}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0b1220'},
  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {color: '#e5e7eb', fontSize: 14, fontWeight: '800'},
  headerBtns: {flexDirection: 'row', gap: 8},
  hBtn: {
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#1f2937',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  hBtnPressed: {opacity: 0.85},
  hBtnText: {color: '#e5e7eb', fontWeight: '900'},
  addressBar: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    gap: 10,
  },
  addressInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1f2937',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e5e7eb',
    backgroundColor: '#0f172a',
  },
  goBtn: {
    width: 56,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBtnPressed: {opacity: 0.9},
  goBtnText: {color: '#fff', fontWeight: '900'},
  webWrap: {flex: 1, borderTopWidth: 1, borderTopColor: '#111827'},
  logsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#111827',
  },
  logsTitle: {color: '#cbd5e1', fontSize: 12, fontWeight: '800'},
  clearBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  clearBtnPressed: {opacity: 0.9},
  clearBtnText: {color: '#fff', fontWeight: '800', fontSize: 12},
  logsWrap: {maxHeight: 220, borderTopWidth: 1, borderTopColor: '#111827'},
  logsContent: {padding: 12, gap: 10},
  logRow: {
    gap: 4,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#111827',
  },
  rowPressed: {opacity: 0.9},
  logMeta: {color: '#94a3b8', fontSize: 11, fontWeight: '700'},
  logText: {color: '#e5e7eb', fontSize: 12, lineHeight: 16},
  cOpen: {color: '#a7f3d0'},
  cMsg: {color: '#fde68a'},
  cErr: {color: '#fecaca'},
  iframeSub: {color: '#94a3b8', fontSize: 11, lineHeight: 15},

  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingTop: 30,
    paddingHorizontal: 12,
  },
  overlayHeader: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#111827',
  },
  overlayHeaderLeft: {flex: 1},
  overlayTitle: {color: '#e5e7eb', fontWeight: '900', fontSize: 14},
  overlaySub: {color: '#94a3b8', fontSize: 11},
  overlayBtn: {
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  overlayBtnText: {color: '#fff', fontWeight: '900', fontSize: 12},
  overlayBody: {
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: '#0b1220',
    borderWidth: 1,
    borderColor: '#111827',
  },
  overlayBodyContent: {padding: 12, gap: 10},
  msgRow: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#111827',
    gap: 6,
  },
  msgMeta: {color: '#94a3b8', fontSize: 11, fontWeight: '800'},
  msgText: {fontSize: 12, lineHeight: 16, color: '#e5e7eb'},
  msgIn: {color: '#fde68a'},
  msgOut: {color: '#bfdbfe'},
});


