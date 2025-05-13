import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, Modal, Alert, ActivityIndicator, ImageBackground, Platform } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useState, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as Speech from 'expo-speech';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons, Ionicons, FontAwesome } from '@expo/vector-icons';
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

const getHtmlContent = (language) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: gap: media:">
  <style>
    body { margin: 0; padding: 0; }
  </style>
</head>
<body>
  <script>
    let recognition = null;
    let isInitialized = false;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    function initSpeechRecognition() {
      if (isInitialized) return;
      
      if (!('webkitSpeechRecognition' in window)) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          error: 'Speech recognition not supported'
        }));
        return;
      }

      try {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = '${language}';
        isInitialized = true;

        recognition.onstart = () => {
          retryCount = 0;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'status',
            status: 'started'
          }));
        };

        recognition.onresult = (event) => {
          const result = event.results[event.results.length - 1];
          const transcript = result[0].transcript;
          
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'result',
            text: transcript,
            isFinal: result.isFinal
          }));
        };

        recognition.onerror = (event) => {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'error',
            error: event.error
          }));

          if (event.error === 'no-speech' || event.error === 'audio-capture') {
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              setTimeout(() => {
                try {
                  recognition.stop();
                  setTimeout(() => recognition.start(), 100);
                } catch (e) {
                  console.error('Error restarting recognition:', e);
                }
              }, 1000);
            }
          }
        };

        recognition.onend = () => {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'status',
            status: 'ended'
          }));
        };

      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          error: 'Failed to initialize speech recognition: ' + error.message
        }));
      }
    }

    function startRecording() {
      if (!recognition) {
        initSpeechRecognition();
      }
      try {
        recognition.start();
      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'error',
          error: 'Failed to start recording: ' + error.message
        }));
      }
    }

    function stopRecording() {
      if (recognition) {
        try {
          recognition.stop();
        } catch (error) {
          console.error('Error stopping recording:', error);
        }
      }
    }

    // Initialize when the page loads
    initSpeechRecognition();
  </script>
</body>
</html>
`;

export default function App() {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState(null);
  const speechTimeoutRef = useRef(null);
  const scrollViewRef = useRef(null);
  const webViewRef = useRef(null);
  const lastResultsRef = useRef([]);

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

  const startRecording = () => {
    try {
      setIsRecording(true);
      setRecordingError(null);
      lastResultsRef.current = [];
      webViewRef.current?.injectJavaScript('startRecording();');
    } catch (error) {
      console.error('Error starting recording:', error);
      setRecordingError('Error starting recording');
      Alert.alert('Failed to start recording', error.message);
    }
  };

  const stopRecording = () => {
    try {
      setIsRecording(false);
      webViewRef.current?.injectJavaScript('stopRecording();');
    } catch (error) {
      console.error('Error stopping recording:', error);
      setRecordingError('Error stopping recording');
      Alert.alert('Failed to stop recording', error.message);
    }
  };

  const handleWebViewMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('WebView message:', data);

      switch (data.type) {
        case 'result':
          if (data.isFinal) {
            lastResultsRef.current = [...lastResultsRef.current, data.text];
            if (lastResultsRef.current.length > 3) {
              lastResultsRef.current.shift();
            }
            setText(data.text);
          }
          break;
        case 'error':
          setRecordingError(data.error);
          Alert.alert('Recording Error', data.error);
          break;
        case 'status':
          if (data.status === 'ended') {
            setIsRecording(false);
            setTimeout(() => {
              if (lastResultsRef.current.length > 0) {
                const finalText = lastResultsRef.current.reduce((a, b) => 
                  a.length > b.length ? a : b
                );
                if (finalText.trim()) {
                  handleSendMessage(finalText);
                  setText('');
                }
                lastResultsRef.current = [];
              }
              setShowVoiceInput(false);
            }, 1000);
          }
          break;
      }
    } catch (error) {
      console.error('Error handling WebView message:', error);
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
      
      const recentMessages = messages.slice(-4);
      const context = recentMessages.map(msg => 
        `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`
      ).join('\n');
      
      const prompt = `Previous conversation context:\n${context}\n\nPlease provide a clear, concise, and accurate response to the following query in ${LANGUAGES[selectedLanguage].name}. Consider the previous conversation context when responding. Avoid using special characters, markdown, or formatting symbols in your response. Current query: ${message}`;
      
      const result = await model.generateContent(prompt);
      const response = result.response.text();

      const aiMessage = { text: response, sender: 'ai', language: selectedLanguage };
      setMessages(prev => [...prev, aiMessage]);
      scrollToBottom();

      const cleanResponse = response
        .replace(/\*/g, '')
        .replace(/[\[\](){}]/g, '')
        .replace(/[#@$%^&+=]/g, '')
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

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

  const scrollToBottom = () => {
    if (scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#1a237e', '#0d47a1']}
        style={styles.background}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Ionicons name="chatbubble-ellipses" size={28} color="#fff" />
              <Text style={styles.headerTitle}>Gemini AI Assistant</Text>
            </View>
            <View style={styles.languageSelector}>
              <MaterialIcons name="language" size={20} color="#fff" />
              <Picker
                selectedValue={selectedLanguage}
                style={styles.picker}
                dropdownIconColor="#fff"
                onValueChange={(itemValue) => {
                  setSelectedLanguage(itemValue);
                  stopSpeaking();
                }}
              >
                {Object.entries(LANGUAGES).map(([code, { name }]) => (
                  <Picker.Item 
                    key={code} 
                    label={name} 
                    value={code} 
                    color={selectedLanguage === code ? '#fff' : '#333'}
                  />
                ))}
              </Picker>
            </View>
          </View>

          {/* Chat Container */}
          <View style={styles.mainContent}>
            <ScrollView 
              ref={scrollViewRef}
              style={styles.chatContainer}
              contentContainerStyle={styles.chatContentContainer}
              onContentSizeChange={scrollToBottom}
              onLayout={scrollToBottom}
              showsVerticalScrollIndicator={false}
            >
              {messages.length === 0 ? (
                <View style={styles.welcomeContainer}>
                  <View style={styles.welcomeIconContainer}>
                    <Ionicons name="chatbubbles" size={60} color="#fff" />
                  </View>
                  <Text style={styles.welcomeText}>How can I help you today?</Text>
                  <Text style={styles.welcomeSubtext}>Ask me anything in your preferred language</Text>
                </View>
              ) : (
                messages.map((message, index) => (
                  <View
                    key={index}
                    style={[
                      styles.messageBubble,
                      message.sender === 'user' ? styles.userMessage : styles.aiMessage,
                    ]}
                  >
                    <View style={styles.messageHeader}>
                      <View style={styles.senderContainer}>
                        {message.sender === 'user' ? (
                          <Ionicons name="person-circle" size={20} color="#fff" />
                        ) : (
                          <Ionicons name="logo-android" size={20} color="#fff" />
                        )}
                        <Text style={styles.senderText}>
                          {message.sender === 'user' ? 'You' : 'Gemini'}
                        </Text>
                      </View>
                      <Text style={styles.languageIndicator}>
                        {LANGUAGES[message.language].name}
                      </Text>
                    </View>
                    <Text style={[
                      styles.messageText,
                      message.sender === 'user' ? styles.userMessageText : styles.aiMessageText,
                      { writingDirection: message.language === 'ur-PK' ? 'rtl' : 'ltr' }
                    ]}>
                      {message.text}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Input Area */}
            <View style={styles.inputContainer}>
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
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.voiceButton]}
                  onPress={() => {
                    stopSpeaking();
                    setShowVoiceInput(true);
                    startRecording();
                  }}
                >
                  <MaterialIcons 
                    name={isSpeaking ? "volume-up" : "keyboard-voice"} 
                    size={24} 
                    color="#fff" 
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.sendButton]}
                  onPress={() => {
                    handleSendMessage(text);
                    setText('');
                  }}
                  disabled={!text.trim()}
                >
                  <Ionicons name="send" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Voice Input Modal */}
          <Modal
            visible={showVoiceInput}
            transparent={true}
            animationType="fade"
            onRequestClose={() => {
              stopRecording();
              setShowVoiceInput(false);
            }}
          >
            <View style={styles.modalOverlay}>
              <LinearGradient
                colors={['rgba(26, 35, 126, 0.95)', 'rgba(13, 71, 161, 0.95)']}
                style={styles.modalContainer}
              >
                <View style={styles.modalContent}>
                  <View style={styles.recordingIndicator}>
                    {isRecording ? (
                      <>
                        <View style={styles.recordingPulse}></View>
                        <FontAwesome name="microphone" size={60} color="#fff" />
                      </>
                    ) : (
                      <FontAwesome name="microphone-slash" size={60} color="#fff" />
                    )}
                  </View>
                  <Text style={styles.modalText}>
                    {isRecording ? 'Listening... Speak now' : 'Recording stopped'}
                  </Text>
                  {recordingError && (
                    <Text style={styles.errorText}>{recordingError}</Text>
                  )}
                  <View style={styles.modalButtons}>
                    {isRecording ? (
                      <TouchableOpacity
                        style={[styles.modalButton, styles.stopButton]}
                        onPress={stopRecording}
                      >
                        <Text style={styles.modalButtonText}>Stop</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.modalButton, styles.startButton]}
                        onPress={startRecording}
                      >
                        <Text style={styles.modalButtonText}>Start Again</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.modalButton, styles.closeButton]}
                      onPress={() => {
                        stopRecording();
                        setShowVoiceInput(false);
                      }}
                    >
                      <Text style={styles.modalButtonText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </LinearGradient>
            </View>
          </Modal>

          <WebView
            ref={webViewRef}
            source={{ html: getHtmlContent(selectedLanguage) }}
            style={{ width: 0, height: 0 }}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            scalesPageToFit={true}
            originWhitelist={['*']}
            mixedContentMode="always"
            allowsInlineMediaPlayback={true}
            mediaPlaybackRequiresUserAction={false}
            allowsFullscreenVideo={true}
            allowFileAccess={true}
            allowUniversalAccessFromFileURLs={true}
            allowFileAccessFromFileURLs={true}
            androidLayerType={Platform.OS === 'android' ? 'hardware' : undefined}
            androidHardwareAccelerationDisabled={false}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error('WebView error:', nativeEvent);
              setRecordingError('WebView error: ' + nativeEvent.description);
            }}
            onLoadEnd={() => {
              console.log('WebView loaded successfully');
            }}
            onLoadStart={() => {
              console.log('WebView starting to load');
            }}
          />

          <StatusBar style="light" />
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1a237e',
  },
  background: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  header: {
    marginBottom: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 8,
  },
  languageSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  picker: {
    height: 70,
    width: 150,
    color: '#fff',
  },
  mainContent: {
    flex: 1,
    marginBottom: 16,
  },
  chatContainer: {
    flex: 1,
    marginBottom: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
  },
  chatContentContainer: {
    paddingBottom: 16,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  welcomeIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginTop: 20,
    textAlign: 'center',
  },
  welcomeSubtext: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 8,
    textAlign: 'center',
  },
  messageBubble: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#2196F3',
    borderBottomRightRadius: 4,
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderBottomLeftRadius: 4,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  senderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  senderText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 4,
  },
  userMessageText: {
    color: '#fff',
  },
  aiMessageText: {
    color: '#fff',
  },
  languageIndicator: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    fontStyle: 'italic',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  sendButton: {
    backgroundColor: '#4CAF50',
  },
  voiceButton: {
    backgroundColor: '#FF5722',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    width: '85%',
    borderRadius: 25,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  modalContent: {
    width: '100%',
    alignItems: 'center',
  },
  recordingIndicator: {
    position: 'relative',
    marginBottom: 30,
  },
  recordingPulse: {
    position: 'absolute',
    top: -15,
    left: -15,
    right: -15,
    bottom: -15,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: -1,
    animationKeyframes: {
      '0%': { transform: [{ scale: 1 }], opacity: 1 },
      '100%': { transform: [{ scale: 1.5 }], opacity: 0 },
    },
    animationDuration: '1500ms',
    animationIterationCount: 'infinite',
  },
  modalText: {
    fontSize: 20,
    color: '#fff',
    marginBottom: 24,
    textAlign: 'center',
    fontWeight: '500',
  },
  errorText: {
    color: '#ffeb3b',
    marginBottom: 24,
    textAlign: 'center',
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    width: '100%',
  },
  modalButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 25,
    marginHorizontal: 8,
    minWidth: 120,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#F44336',
  },
  closeButton: {
    backgroundColor: '#607D8B',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});