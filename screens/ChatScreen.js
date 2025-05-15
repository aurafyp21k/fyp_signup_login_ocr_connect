import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Image,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getDatabase, ref, onValue, push, serverTimestamp } from 'firebase/database';
import { getAuth } from 'firebase/auth';
import * as Notifications from 'expo-notifications';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const ChatScreen = ({ route, navigation }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const flatListRef = useRef(null);
  const { chatId, otherUser } = route.params;
  const db = getDatabase();
  const auth = getAuth();
  const notificationListener = useRef();
  const responseListener = useRef();
  const processedMessageIds = useRef(new Set());

  // Request notification permissions
  useEffect(() => {
    (async () => {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        Alert.alert('Permission Required', 'Please enable notifications to receive chat messages');
        return;
      }

      // Set up notification channels for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('chat-messages', {
          name: 'Chat Messages',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    })();
  }, []);

  // Set up notification listener
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      // Handle received notification
      const { title, body } = notification.request.content;
      // You can update UI or state here if needed
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      // Handle notification response (when user taps notification)
      const { title, body } = response.notification.request.content;
      // Navigate to chat or perform other actions
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []);

  // Function to send notification
  const sendNotification = async (title, body) => {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { 
            type: 'chat_message',
            chatId: chatId,
            otherUser: otherUser
          },
        },
        trigger: null, // null means show immediately
      });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  };

  useEffect(() => {
    const messagesRef = ref(db, `chats/${chatId}/messages`);
    
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const messagesList = [];
      snapshot.forEach((child) => {
        messagesList.push({
          id: child.key,
          ...child.val(),
        });
      });
      const sortedMessages = messagesList.sort((a, b) => a.timestamp - b.timestamp);
      setMessages(sortedMessages);

      // Check for new messages
      if (sortedMessages.length > 0) {
        const lastMessage = sortedMessages[sortedMessages.length - 1];
        
        // Only send notification if:
        // 1. The message is from the other user
        // 2. We haven't processed this message ID before
        if (lastMessage.senderId !== auth.currentUser.uid && 
            !processedMessageIds.current.has(lastMessage.id)) {
          
          // Add message ID to processed set
          processedMessageIds.current.add(lastMessage.id);
          
          // Send notification for new message
          Notifications.scheduleNotificationAsync({
            content: {
              title: otherUser?.name || 'New Message',
              body: lastMessage.text,
              sound: true,
              priority: Notifications.AndroidNotificationPriority.HIGH,
              data: { 
                type: 'chat_message',
                chatId: chatId,
                otherUser: otherUser
              },
            },
            trigger: null,
          });
        }
      }
    });

    return () => {
      unsubscribe();
      // Clear processed messages when leaving the screen
      processedMessageIds.current.clear();
    };
  }, [chatId]);

  const sendMessage = async () => {
    if (message.trim() === '') return;

    const currentUser = auth.currentUser;
    const messagesRef = ref(db, `chats/${chatId}/messages`);

    const newMessage = {
      type: 'text',
      text: message.trim(),
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'User',
      timestamp: serverTimestamp(),
    };

    try {
      await push(messagesRef, newMessage);
      setMessage('');
      Keyboard.dismiss();
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const renderMessage = ({ item }) => {
    const isCurrentUser = item.senderId === auth.currentUser.uid;

    return (
      <View style={[
        styles.messageWrapper,
        isCurrentUser ? styles.currentUserWrapper : styles.otherUserWrapper
      ]}>
        {!isCurrentUser && (
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.senderName.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
        )}
        <View style={[
          styles.messageContainer,
          isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage
        ]}>
          <Text style={[
            styles.messageText,
            isCurrentUser ? styles.currentUserMessageText : styles.otherUserMessageText
          ]}>
            {item.text}
          </Text>
          <Text style={[
            styles.timestamp,
            isCurrentUser ? styles.currentUserTimestamp : styles.otherUserTimestamp
          ]}>
            {new Date(item.timestamp).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>{otherUser?.name || 'Chat'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.chatContainer}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          onLayout={() => flatListRef.current?.scrollToEnd()}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={styles.inputWrapper}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={message}
            onChangeText={setMessage}
            placeholder="Type a message..."
            placeholderTextColor="#718096"
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!message.trim()}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: '#00b8ff',
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
    paddingTop: Platform.OS === 'ios' ? 50 : 10,
    paddingBottom: 15,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  messagesList: {
    padding: 15,
  },
  messageWrapper: {
    flexDirection: 'row',
    marginBottom: 15,
    maxWidth: '85%',
  },
  currentUserWrapper: {
    alignSelf: 'flex-end',
  },
  otherUserWrapper: {
    alignSelf: 'flex-start',
  },
  avatarContainer: {
    marginRight: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00b8ff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  messageContainer: {
    padding: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  currentUserMessage: {
    backgroundColor: '#00b8ff',
    borderBottomRightRadius: 4,
  },
  otherUserMessage: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  currentUserMessageText: {
    color: '#ffffff',
    fontWeight: '500',
  },
  otherUserMessageText: {
    color: '#1a202c',
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 12,
    marginTop: 4,
  },
  currentUserTimestamp: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  otherUserTimestamp: {
    color: '#718096',
  },
  inputWrapper: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1a202c',
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00b8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    shadowColor: '#00b8ff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#cbd5e0',
    shadowColor: '#cbd5e0',
  },
});

export default ChatScreen;
