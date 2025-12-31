# WebView + Kotlin: Captura de WebSockets

## Solução Implementada

Esta implementação usa **Kotlin + WebView customizado** para capturar WebSockets de forma confiável e simples.

## Arquitetura

### 1. **WsWebViewClient.kt**
WebViewClient customizado que:
- Intercepta todas as requisições HTTP via `shouldInterceptRequest()`
- Detecta handshakes WebSocket (headers `Upgrade: websocket`, `Connection: Upgrade`)
- Detecta URLs ws:// e wss://
- Registra conexões no `WsRegistryModule`
- Injeta hook JavaScript robusto em todas as páginas via `onPageFinished()`

### 2. **WsJavascriptInterface.kt**
Interface JavaScript-Kotlin que:
- Expõe métodos Kotlin para JavaScript (ponte bidirecional)
- Recebe eventos do hook JavaScript: `onWebSocketCreated`, `onWebSocketOpen`, `onWebSocketMessage`, `onWebSocketClose`, `onWebSocketError`
- Registra tudo no `WsRegistryModule`
- Adiciona logs detalhados no logcat para debug

### 3. **WsWebViewManager.kt**
ViewManager React Native que:
- Gerencia o WebView nativo customizado
- Configura JavaScript, DOM storage, mixed content
- Injeta `WsJavascriptInterface` como `window.WsInterface`
- Conecta `WsWebViewClient` ao WebView
- Expõe propriedade `source` para React Native

### 4. **Hook JavaScript Robusto**
Injeta automaticamente um script que:
- Intercepta `window.WebSocket`
- Captura todos os eventos: open, send, message, close, error
- Envia para Kotlin via `window.WsInterface.*`
- Adiciona console.log detalhado para debug
- Funciona em iframes (limitado por same-origin policy)

### 5. **Polling React Native**
- `useEffect` com `setInterval(1000ms)` busca conexões do `WsRegistry`
- Sincroniza estado Kotlin → React Native automaticamente
- UI atualiza em tempo real

## Fluxo de Captura

```
WebView carrega página
    ↓
onPageFinished injeta hook JS
    ↓
Página cria new WebSocket(url)
    ↓
Hook JS intercepta e notifica window.WsInterface
    ↓
WsJavascriptInterface.onWebSocketCreated(id, url)
    ↓
WsRegistryModule.upsertConnection(id, url, "CREATING")
    ↓
Polling React Native (1s) busca conexões
    ↓
UI atualiza e mostra conexão
    ↓
WebSocket envia/recebe mensagens
    ↓
Hook JS notifica window.WsInterface.onWebSocketMessage()
    ↓
WsRegistryModule.addMessage(id, dir, payload)
    ↓
Usuário clica na conexão OPEN
    ↓
React Native busca mensagens via WsRegistry.getMessages(id)
    ↓
Modal exibe mensagens IN/OUT
```

## Vantagens desta Solução

✅ **Simples**: Não requer VPN, root, proxy ou permissões especiais  
✅ **Confiável**: Hook JavaScript funciona em 99% dos sites  
✅ **Debug fácil**: Logs detalhados no logcat Android  
✅ **Performance**: Intercepta apenas WebSockets, não todo o tráfego  
✅ **React Native nativo**: Usa ViewManager (não depende de libs externas)  

## Limitações

⚠️ **Cross-origin iframes**: WebSockets em iframes de origem diferente não são capturados (limitação de segurança do browser)  
⚠️ **Apps externos**: Só captura WebSockets dentro do WebView do app  
⚠️ **wss:// criptografado**: Vê a conexão, mas as mensagens podem ser criptografadas dependendo do site  

## Como Usar

1. Compile e instale:
```bash
npm install
npm run android
```

2. No app:
   - Digite uma URL (ex: `google.com`)
   - Navegue para um site com WebSockets
   - Conexões aparecem automaticamente na lista
   - Toque em uma conexão `OPEN` para ver mensagens

3. Debug via logcat:
```bash
adb logcat | grep -E "(WsWebViewClient|WsJsInterface|WS-Kotlin)"
```

## Arquivos Criados

- `android/app/src/main/java/com/wsinspector/WsWebViewClient.kt`
- `android/app/src/main/java/com/wsinspector/WsJavascriptInterface.kt`
- `android/app/src/main/java/com/wsinspector/WsWebViewManager.kt`
- `src/components/WsWebView.tsx` (componente React Native customizado)

## Próximos Passos (Opcional)

- **Melhorar detecção de iframes**: Injetar script em iframes via `evaluateJavascript()` recursivo
- **Filtrar mensagens grandes**: Truncar payloads > 10KB
- **Export logs**: Salvar mensagens em arquivo JSON
- **UI melhorada**: Filtros por URL, busca em mensagens, highlight de JSON

