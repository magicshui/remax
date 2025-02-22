import * as React from 'react';
import { View, Text } from 'remax/alipay';

export default () => {
  const props = {};
  const TextElement = React.cloneElement(<Text />);

  function handleClick() {}

  function handleTouchStart() {}

  return (
    <View>
      <View
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        id="view"
        {...props}
      >
        foo
      </View>
      {TextElement}
    </View>
  );
};
