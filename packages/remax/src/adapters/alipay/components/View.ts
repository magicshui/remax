import * as React from 'react';
import factory from './factory';

export interface ViewProps {
  readonly dataset?: DOMStringMap;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  disableScroll?: boolean;
  hoverClass?: string;
  hoverStartTime?: number;
  hoverStayTime?: number;
  hidden?: boolean;
  animation?: any;
  hoverStopPropagation?: boolean;
  onTap?: (e: any) => void;
  onClick?: (e: any) => void;
  onTouchStart?: (e: any) => void;
  onTouchMove?: (e: any) => void;
  onTouchEnd?: (e: any) => void;
  onTouchCancel?: (e: any) => void;
  onLongTap?: (e: any) => void;
  onTransitionEnd?: (e: any) => void;
  onAnimationIteration?: (e: any) => void;
  onAnimationStart?: (e: any) => void;
  onAnimationEnd?: (e: any) => void;
  onAppear?: (e: any) => void;
  onDisappear?: (e: any) => void;
  onFirstAppear?: (e: any) => void;
}

const View = factory<ViewProps>('view');

export default View;
