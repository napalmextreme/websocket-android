# WsInspector (Android-only)

App React Native **focado em Android** para “inspecionar” um **WebSocket específico** (ws:// ou wss://), mostrando tudo que entra (IN) e sai (OUT), com filtro e envio de mensagens.

## O que ele faz (e o que não faz)

- **Faz**:
  - conecta em uma URL WebSocket que você informar e exibe logs (IN/OUT/INFO/ERRO), permite filtrar e enviar mensagens.
  - tem um **navegador dentro do app** que tenta detectar WebSockets criados pela página (hook no `window.WebSocket`) e mostra nos logs.
- **Não faz**:
  - “capturar todos os WebSockets do celular (Chrome/Google app/outros apps)”. Para isso seria necessário uma abordagem tipo **VPN local / proxy / MITM / root**, e para `wss://` ainda tem criptografia.
  - em alguns casos, capturar WebSocket criado em **iframe cross-origin** ou **iframe sandbox** (o WebView pode impedir injeção de JS nesses frames).

## Rodando no Android

### 1) Instalar dependências

```sh
cd WsInspector
npm install
```

### 2) Iniciar o Metro (porta 8082)

Este projeto usa **8082** por padrão para evitar conflito com outros projetos usando 8081.

```sh
cd WsInspector
npm start
```

### 3) Rodar no Android

Em outro terminal:

```sh
cd WsInspector
npm run android
```

## Dica importante (ws://)

O Android pode bloquear tráfego “cleartext” (sem TLS). Este projeto está com `usesCleartextTraffic="true"` no `AndroidManifest.xml` para facilitar testes com `ws://` em rede local.
