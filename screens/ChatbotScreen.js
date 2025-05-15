import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Modal, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as Speech from 'expo-speech';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Audio } from 'expo-av';
import * as Permissions from 'expo-permissions';
import React from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI('AIzaSyCJeBrJ0liMxye8rEgScMfUqjv7mLEoRhQ');

// Language configurations
const LANGUAGES = {
  'en-US': { name: 'English', code: 'en-US' },
  'ur-PK': { name: 'اردو', code: 'ur-PK' },
  'hi-IN': { name: 'हिंदी', code: 'hi-IN' },
  'ar-SA': { name: 'العربية', code: 'ar-SA' },
  'es-ES': { name: 'Español', code: 'es-ES' },
  'fr-FR': { name: 'Français', code: 'fr-FR' },
};

// HTML for WebView with Web Speech API
const getHtmlContent = (language) => `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 0; }
        #status { 
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            display: none;
        }
    </style>
</head>
<body>
    <div id="status">Listening...</div>
    <script>
        let recognition = null;
        
        if ('webkitSpeechRecognition' in window) {
            recognition = new webkitSpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = '${language}';

            recognition.onstart = () => {
                document.getElementById('status').style.display = 'block';
                window.ReactNativeWebView.postMessage('STARTED');
            };

            recognition.onend = () => {
                document.getElementById('status').style.display = 'none';
                window.ReactNativeWebView.postMessage('STOP');
            };

            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                window.ReactNativeWebView.postMessage(transcript);
            };

            recognition.onerror = (event) => {
                window.ReactNativeWebView.postMessage('ERROR: ' + event.error);
            };

            // Start listening immediately
            recognition.start();
        } else {
            window.ReactNativeWebView.postMessage('ERROR: Speech recognition not supported');
        }
    </script>
</body>
</html>
`;

export default function ChatbotScreen() {
  const navigation = useNavigation();
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [isRecording, setIsRecording] = useState(false);
  const speechTimeoutRef = useRef(null);
  const scrollViewRef = useRef(null);
  const webViewRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant microphone permission to use voice features.');
      }
    })();
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const startRecording = () => {
    setShowVoiceInput(true);
    setIsRecording(true);
  };

  const stopRecording = () => {
    setIsRecording(false);
    setShowVoiceInput(false);
  };

  const stopSpeaking = async () => {
    try {
      await Speech.stop();
      setIsSpeaking(false);
      if (speechTimeoutRef.current) {
        clearTimeout(speechTimeoutRef.current);
        speechTimeoutRef.current = null;
      }
    } catch (error) {
      console.error('Error stopping speech:', error);
    }
  };

  const handleWebViewMessage = (event) => {
    const message = event.nativeEvent.data;
    if (message === 'STARTED') {
      stopSpeaking();
    } else if (message === 'STOP') {
      setShowVoiceInput(false);
      setIsRecording(false);
    } else if (message.startsWith('ERROR:')) {
      alert(message);
      setShowVoiceInput(false);
      setIsRecording(false);
    } else {
      setText('');
      handleSendMessage(message);
      setShowVoiceInput(false);
      setIsRecording(false);
    }
  };

  const cleanTextForSpeech = (text) => {
    return text
      .replace(/\*/g, '')
      .replace(/[\[\](){}]/g, '')
      .replace(/[#@$%^&+=]/g, '')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const scrollToBottom = () => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  };

  const handleSendMessage = async (message) => {
    if (!message.trim()) return;
  
    await stopSpeaking();
  
    const userMessage = { text: message, sender: 'user', language: selectedLanguage };
    setMessages(prev => [...prev, userMessage]);
    scrollToBottom();
  
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  
      // Last 4 messages for context
      const recentMessages = messages.slice(-4);
      const context = recentMessages.map(msg =>
        `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`
      ).join('\n');
  
      // Categories with disclaimers & guidance
      const categories = {
        medical: {
          keywords: ['pain', 'sick', 'disease', 'symptom', 'doctor', 'hospital', 'medicine', 'treatment', 'diagnosis', 'illness', 'health', 'medical'],
          disclaimer: '⚠️ Disclaimer: This is not a substitute for professional medical advice. Please consult a healthcare provider for an accurate diagnosis and treatment.',
          guidance: 'Provide basic information about the medical condition, its causes, common symptoms, and general treatments.'
        },
        mechanical: {
          keywords: ['engine', 'repair', 'fix', 'broken', 'machine', 'mechanical', 'vehicle', 'car', 'motor', 'part', 'maintenance', 'technical', 'heated', 'overheating', 'temperature', 'coolant', 'oil', 'brake', 'transmission', 'battery', 'tire', 'wheel', 'suspension', 'exhaust', 'fuel', 'gas', 'petrol', 'diesel'],
          disclaimer: '⚠️ Disclaimer: This is general mechanical advice. For complex repairs, consult a certified mechanic.',
          guidance: 'Provide troubleshooting steps, common causes, safety checks, and preventive measures for the mechanical issue.'
        }
      };
  
      // Determine category
      let category = 'general';
      let disclaimer = '';
      let guidance = '';
  
      for (const [cat, data] of Object.entries(categories)) {
        if (data.keywords.some(keyword => message.toLowerCase().includes(keyword))) {
          category = cat;
          disclaimer = data.disclaimer;
          guidance = data.guidance;
          break;
        }
      }
  
      // Prepare prompt
      const prompt = `
  ${category !== 'general' ? guidance : ''}
  ${category !== 'general' ? disclaimer : ''}
  
  Previous conversation context:
  ${context}
  
  Please provide a clear, concise, and accurate response to the following user query in ${LANGUAGES[selectedLanguage].name}.
  Avoid using special characters, markdown, or formatting symbols.
  
  User Query: ${message}
      `.trim();
  
      // Generate AI response
      const result = await model.generateContent(prompt);
      const response = result.response.text();
  
      // Add AI response to chat
      const aiMessage = { text: response, sender: 'ai', language: selectedLanguage };
      setMessages(prev => [...prev, aiMessage]);
      scrollToBottom();
  
      // Speak response
      const cleanResponse = cleanTextForSpeech(response);
      await Speech.speak(cleanResponse, {
        language: selectedLanguage,
        pitch: 1.0,
        rate: 0.9,
        onStart: () => setIsSpeaking(true),
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
  
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = { text: 'Sorry, I encountered an error.', sender: 'ai', language: selectedLanguage };
      setMessages(prev => [...prev, errorMessage]);
      scrollToBottom();
    }
  };

  // const handleSendMessage = async (message) => {
  //   if (!message.trim()) return;

  //   await stopSpeaking();

  //   const userMessage = { text: message, sender: 'user', language: selectedLanguage };
  //   setMessages(prev => [...prev, userMessage]);
  //   scrollToBottom();

  //   try {
  //     const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
  //     // Create a context from previous messages
  //     const recentMessages = messages.slice(-4); // Get last 4 messages for context
  //     const context = recentMessages.map(msg => 
  //       `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`
  //     ).join('\n');
      
  //     // Define categories and their disclaimers
  //     const categories = {
  //       medical: {
  //         keywords: ['pain', 'sick', 'disease', 'symptom', 'doctor', 'hospital', 'medicine', 'treatment', 'diagnosis', 'illness', 'health', 'medical'],
  //         guidance: 'Please provide general information about the medical condition and any relevant symptoms. Include basic information about the condition, its causes, and common treatments.'
  //       },
  //       mechanical: {
  //         keywords: ['engine', 'repair', 'fix', 'broken', 'machine', 'mechanical', 'vehicle', 'car', 'motor', 'part', 'maintenance', 'technical', 'heated', 'overheating', 'temperature', 'coolant', 'oil', 'brake', 'transmission', 'battery', 'tire', 'wheel', 'suspension', 'exhaust', 'fuel', 'gas', 'petrol', 'diesel'],
  //         guidance: 'Please provide general troubleshooting steps and preventive measures for the issue. Include basic safety checks, common causes, and immediate actions that can be taken. Focus on steps that can help prevent further damage while waiting for professional help.'
  //       }
  //     };

  //     // Check message category
  //     let category = 'general';
  //     // let disclaimer = '';
  //     let guidance = '';
      
  //     for (const [cat, data] of Object.entries(categories)) {
  //       if (data.keywords.some(keyword => message.toLowerCase().includes(keyword))) {
  //         category = cat;
  //         disclaimer = data.disclaimer;
  //         guidance = data.guidance || '';
  //         break;
  //       }
  //     }
      
  //     const prompt = category !== 'general'
  //       ? `${guidance}\n\nPrevious conversation context:\n${context}\n\nPlease provide a clear, concise, and accurate response to the following query in ${LANGUAGES[selectedLanguage].name}. Consider the previous conversation context when responding. Avoid using special characters, markdown, or formatting symbols in your response. Current query: ${message}`
  //       : `Previous conversation context:\n${context}\n\nPlease provide a clear, concise, and accurate response to the following query in ${LANGUAGES[selectedLanguage].name}. Consider the previous conversation context when responding. Avoid using special characters, markdown, or formatting symbols in your response. Current query: ${message}`;
      
  //     const result = await model.generateContent(prompt);
  //     const response = result.response.text();

  //     const aiMessage = { text: response, sender: 'ai', language: selectedLanguage };
  //     setMessages(prev => [...prev, aiMessage]);
  //     scrollToBottom();

  //     const cleanResponse = cleanTextForSpeech(response);
  //     await Speech.speak(cleanResponse, {
  //       language: selectedLanguage,
  //       pitch: 1.0,
  //       rate: 0.9,
  //       onStart: () => setIsSpeaking(true),
  //       onDone: () => setIsSpeaking(false),
  //       onError: () => setIsSpeaking(false),
  //     });
  //   } catch (error) {
  //     console.error('Error:', error);
  //     const errorMessage = { text: 'Sorry, I encountered an error.', sender: 'ai', language: selectedLanguage };
  //     setMessages(prev => [...prev, errorMessage]);
  //     scrollToBottom();
  //   }
  // };

  return (
    <View style={styles.safeArea}>
      <LinearGradient
        colors={['#4f46e5', '#7c3aed', '#2563eb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.navigate('Home')}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI Assistant</Text>
        </View>

        <Animated.View style={[styles.languageSelector, { opacity: fadeAnim }]}>
          <Text style={styles.languageLabel}>Language:</Text>
          <Picker
            selectedValue={selectedLanguage}
            style={styles.picker}
            onValueChange={(itemValue) => {
              setSelectedLanguage(itemValue);
              stopSpeaking();
            }}
          >
            {Object.entries(LANGUAGES).map(([code, { name }]) => (
              <Picker.Item key={code} label={name} value={code} />
            ))}
          </Picker>
        </Animated.View>

        <ScrollView 
          ref={scrollViewRef}
          style={styles.chatContainer}
          onContentSizeChange={scrollToBottom}
          onLayout={scrollToBottom}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((message, index) => (
            <Animated.View
              key={index}
              style={[
                styles.messageBubble,
                message.sender === 'user' ? styles.userMessage : styles.aiMessage,
                { opacity: fadeAnim }
              ]}
            >
              <Text style={[
                styles.messageText,
                message.sender === 'user' ? styles.userMessageText : styles.aiMessageText,
                { writingDirection: message.language === 'ur-PK' ? 'rtl' : 'ltr' }
              ]}>
                {message.text}
              </Text>
            </Animated.View>
          ))}
        </ScrollView>

        <Animated.View style={[styles.inputContainer, { opacity: fadeAnim }]}>
          <TextInput
            style={[
              styles.input,
              { writingDirection: selectedLanguage === 'ur-PK' ? 'rtl' : 'ltr' }
            ]}
            value={text}
            onChangeText={(newText) => {
              setText(newText);
              stopSpeaking();
            }}
            placeholder="Type a message..."
            placeholderTextColor="rgba(255, 255, 255, 0.6)"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, text.trim() ? styles.sendButtonActive : {}]}
            onPress={() => {
              handleSendMessage(text);
              setText('');
            }}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.voiceButton, isRecording && styles.voiceButtonActive]}
            onPress={isRecording ? stopRecording : startRecording}
          >
            <Text style={styles.voiceButtonText}>
              {isRecording ? '⏹️' : '🎤'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <Modal
          visible={showVoiceInput}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            stopSpeaking();
            setShowVoiceInput(false);
          }}
        >
          <View style={styles.modalContainer}>
            <Animated.View style={[styles.modalContent, { opacity: fadeAnim }]}>
              <Text style={styles.modalText}>Speak now...</Text>
              <WebView
                ref={webViewRef}
                source={{ html: getHtmlContent(selectedLanguage) }}
                onMessage={handleWebViewMessage}
                style={styles.webview}
              />
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  stopSpeaking();
                  setShowVoiceInput(false);
                }}
              >
                <Text style={styles.closeButtonText}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>

        <StatusBar style="light" />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  languageSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  languageLabel: {
    fontSize: 18,
    marginRight: 10,
    color: '#ffffff',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  picker: {
    flex: 1,
    height: 50,
    color: '#ffffff',
  },
  chatContainer: {
    flex: 1,
    padding: 16,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 16,
    borderRadius: 24,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#4f46e5',
    borderBottomRightRadius: 4,
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
  },
  userMessageText: {
    color: '#ffffff',
  },
  aiMessageText: {
    color: '#ffffff',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 5,
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginRight: 12,
    maxHeight: 100,
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  sendButton: {
    backgroundColor: 'rgba(79, 70, 229, 0.5)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  sendButtonActive: {
    backgroundColor: '#4f46e5',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  voiceButton: {
    backgroundColor: '#7c3aed',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  voiceButtonActive: {
    backgroundColor: '#f43f77',
    shadowColor: '#f43f77',
  },
  voiceButtonText: {
    color: '#ffffff',
    fontSize: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 24,
    padding: 24,
    width: '85%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  modalText: {
    fontSize: 20,
    marginBottom: 24,
    color: '#ffffff',
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  webview: {
    width: 1,
    height: 1,
  },
  closeButton: {
    marginTop: 24,
    padding: 12,
    backgroundColor: '#f43f77',
    borderRadius: 16,
    shadowColor: '#f43f77',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});