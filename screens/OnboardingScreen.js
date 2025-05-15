import React, { useRef, useState } from 'react';
import { Image, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Swiper from 'react-native-swiper';
import { useNavigation } from '@react-navigation/native';
import { onboarding } from '../constants';

const OnboardingScreen = () => {
  const navigation = useNavigation();
  const swiperRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const isLastSlide = activeIndex === onboarding.length - 1;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
      <TouchableOpacity
        onPress={() => {
          navigation.replace('Login');
        }}
        style={{ width: '100%', alignItems: 'flex-end', padding: 20 }}
      >
        <Text style={{ color: 'black', fontSize: 16, fontWeight: 'bold' }}>Skip</Text>
      </TouchableOpacity>

      <Swiper
        ref={swiperRef}
        loop={false}
        dot={
          <View style={{ width: 32, height: 4, marginHorizontal: 4, backgroundColor: '#E2E8F0', borderRadius: 2 }} />
        }
        activeDot={
          <View style={{ width: 32, height: 4, marginHorizontal: 4, backgroundColor: '#0286FF', borderRadius: 2 }} />
        }
        onIndexChanged={(index) => setActiveIndex(index)}
      >
        {onboarding.map((item) => (
          <View key={item.id} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <Image
              source={item.image}
              style={{ width: '100%', height: 300 }}
              resizeMode="contain"
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', marginTop: 40 }}>
              <Text style={{ color: 'black', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginHorizontal: 40 }}>
                {item.title}
              </Text>
            </View>
            <Text style={{ fontSize: 16, fontWeight: '600', textAlign: 'center', color: '#858585', marginHorizontal: 40, marginTop: 12 }}>
              {item.description}
            </Text>
          </View>
        ))}
      </Swiper>

      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          isLastSlide
            ? navigation.replace('Login')
            : swiperRef.current?.scrollBy(1)
        }
      >
        <Text style={styles.buttonText}>
          {isLastSlide ? "Get Started" : "Next"}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#0286FF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: '#0286FF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default OnboardingScreen; 