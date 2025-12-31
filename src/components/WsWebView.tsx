import React from 'react';
import {requireNativeComponent, ViewStyle} from 'react-native';

interface WsWebViewProps {
  source?: string;
  style?: ViewStyle;
}

const NativeWsWebView = requireNativeComponent<WsWebViewProps>('WsWebView');

export const WsWebView: React.FC<WsWebViewProps> = ({source, style}) => {
  return <NativeWsWebView source={source} style={style} />;
};

