'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

exports['default'] = HealthCard;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _react = require('react');

var _react2 = _interopRequireDefault(_react);

var _reactNative = require('react-native');

var _expoVectorIcons = require('@expo/vector-icons');

var _constantsColors = require('../constants/colors');

/**
 * One health-data card: icon, title, current value and unit.
 *
 * The card animates in three ways:
 *  - it fades and slides in when it first appears (staggered by `index`);
 *  - while there is no reading yet it blinks slowly, so an empty card looks
 *    like it is waiting rather than broken;
 *  - once readings arrive the icon breathes with a pulse ring behind it, and
 *    every new value pops so a change is impossible to miss.
 *
 * Props:
 *  - title      "Steps"
 *  - value      "8,432"
 *  - unit       "steps"
 *  - icon       an Ionicons name, e.g. "footsteps"
 *  - color      accent color for the icon
 *  - background pale background behind the icon
 *  - width      card width in pixels (calculated by the screen)
 *  - isLive     true once this card shows a real reading
 *  - index      position in the grid, used to stagger the entrance
 */

function HealthCard(_ref) {
  var title = _ref.title;
  var value = _ref.value;
  var unit = _ref.unit;
  var icon = _ref.icon;
  var color = _ref.color;
  var background = _ref.background;
  var width = _ref.width;
  var _ref$isLive = _ref.isLive;
  var isLive = _ref$isLive === undefined ? false : _ref$isLive;
  var _ref$index = _ref.index;
  var index = _ref$index === undefined ? 0 : _ref$index;

  // Entrance: 0 -> 1 once, just after mount.
  var enter = (0, _react.useRef)(new _reactNative.Animated.Value(0)).current;
  // Idle blink while the card is still waiting for its first reading.
  var blink = (0, _react.useRef)(new _reactNative.Animated.Value(1)).current;
  // Icon "breathing" and the ring that expands out of it when live.
  var iconScale = (0, _react.useRef)(new _reactNative.Animated.Value(1)).current;
  var ring = (0, _react.useRef)(new _reactNative.Animated.Value(0)).current;
  // Short pop played every time the value text changes.
  var pop = (0, _react.useRef)(new _reactNative.Animated.Value(1)).current;

  var previousValue = (0, _react.useRef)(value);

  // --- entrance -----------------------------------------------------------
  (0, _react.useEffect)(function () {
    _reactNative.Animated.timing(enter, {
      toValue: 1,
      duration: 420,
      delay: index * 90,
      easing: _reactNative.Easing.out(_reactNative.Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [enter, index]);

  // --- waiting: slow blink ------------------------------------------------
  (0, _react.useEffect)(function () {
    if (isLive) {
      blink.setValue(1);
      return undefined;
    }

    var loop = _reactNative.Animated.loop(_reactNative.Animated.sequence([_reactNative.Animated.timing(blink, {
      toValue: 0.35,
      duration: 700,
      easing: _reactNative.Easing.inOut(_reactNative.Easing.quad),
      useNativeDriver: true
    }), _reactNative.Animated.timing(blink, {
      toValue: 1,
      duration: 700,
      easing: _reactNative.Easing.inOut(_reactNative.Easing.quad),
      useNativeDriver: true
    })]));
    loop.start();

    return function () {
      loop.stop();
      blink.setValue(1);
    };
  }, [blink, isLive]);

  // --- live: icon breathes, ring expands ----------------------------------
  (0, _react.useEffect)(function () {
    if (!isLive) {
      iconScale.setValue(1);
      ring.setValue(0);
      return undefined;
    }

    var breathe = _reactNative.Animated.loop(_reactNative.Animated.sequence([_reactNative.Animated.timing(iconScale, {
      toValue: 1.12,
      duration: 620,
      easing: _reactNative.Easing.out(_reactNative.Easing.quad),
      useNativeDriver: true
    }), _reactNative.Animated.timing(iconScale, {
      toValue: 1,
      duration: 620,
      easing: _reactNative.Easing['in'](_reactNative.Easing.quad),
      useNativeDriver: true
    })]));

    var halo = _reactNative.Animated.loop(_reactNative.Animated.sequence([_reactNative.Animated.timing(ring, {
      toValue: 1,
      duration: 1400,
      easing: _reactNative.Easing.out(_reactNative.Easing.ease),
      useNativeDriver: true
    }),
    // Small gap so the rings come in waves instead of a solid glow.
    _reactNative.Animated.delay(320)]));

    breathe.start();
    halo.start();

    return function () {
      breathe.stop();
      halo.stop();
      iconScale.setValue(1);
      ring.setValue(0);
    };
  }, [iconScale, isLive, ring]);

  // --- a new reading: pop the value ---------------------------------------
  (0, _react.useEffect)(function () {
    if (previousValue.current === value) return;
    previousValue.current = value;

    pop.stopAnimation(function () {
      pop.setValue(1);
      _reactNative.Animated.sequence([_reactNative.Animated.timing(pop, {
        toValue: 1.18,
        duration: 140,
        easing: _reactNative.Easing.out(_reactNative.Easing.quad),
        useNativeDriver: true
      }), _reactNative.Animated.spring(pop, {
        toValue: 1,
        friction: 4,
        tension: 120,
        useNativeDriver: true
      })]).start();
    });
  }, [pop, value]);

  var translateY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0]
  });

  var ringScale = ring.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.9]
  });

  var ringOpacity = ring.interpolate({
    inputRange: [0, 0.15, 1],
    outputRange: [0, 0.35, 0]
  });

  return _react2['default'].createElement(
    _reactNative.Animated.View,
    {
      style: [styles.card, { width: width, opacity: enter, transform: [{ translateY: translateY }] }]
    },
    _react2['default'].createElement(
      _reactNative.View,
      { style: styles.iconWrap },
      isLive && _react2['default'].createElement(_reactNative.Animated.View, {
        pointerEvents: 'none',
        style: [styles.pulseRing, {
          backgroundColor: color,
          opacity: ringOpacity,
          transform: [{ scale: ringScale }]
        }]
      }),
      _react2['default'].createElement(
        _reactNative.Animated.View,
        {
          style: [styles.iconCircle, {
            backgroundColor: background,
            opacity: blink,
            transform: [{ scale: iconScale }]
          }]
        },
        _react2['default'].createElement(_expoVectorIcons.Ionicons, { name: icon, size: 22, color: color })
      )
    ),
    _react2['default'].createElement(
      _reactNative.Text,
      { style: styles.title },
      title
    ),
    _react2['default'].createElement(
      _reactNative.View,
      { style: styles.valueRow },
      _react2['default'].createElement(
        _reactNative.Animated.Text,
        {
          style: [styles.value, { opacity: blink, transform: [{ scale: pop }] }]
        },
        value
      ),
      _react2['default'].createElement(
        _reactNative.Text,
        { style: styles.unit },
        unit
      )
    )
  );
}

var styles = _reactNative.StyleSheet.create({
  card: {
    backgroundColor: _constantsColors.colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,

    // Subtle shadow on iOS...
    shadowColor: _constantsColors.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    // ...and on Android.
    elevation: 3
  },
  // Holds the icon and the pulse ring on top of each other.
  iconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14
  },
  pulseRing: _extends({}, _reactNative.StyleSheet.absoluteFillObject, {
    borderRadius: 22
  }),
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontSize: 14,
    color: _constantsColors.colors.muted,
    marginBottom: 6
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end'
  },
  value: {
    fontSize: 26,
    fontWeight: '700',
    color: _constantsColors.colors.title,
    // Grow from the bottom-left so the pop does not shove the unit around.
    transformOrigin: 'left bottom'
  },
  unit: {
    fontSize: 13,
    color: _constantsColors.colors.muted,
    marginLeft: 6,
    marginBottom: 4
  }
});
module.exports = exports['default'];
