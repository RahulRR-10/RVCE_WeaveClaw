import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/chat_message.dart';

/// Represents a single chat session.
class ChatSession {
  ChatSession({
    required this.id,
    required this.title,
    required this.createdAt,
    this.messages = const [],
  });

  final String id;
  String title;
  final DateTime createdAt;
  List<ChatMessage> messages;

  String get sessionId => 'flutter-$id';

  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'createdAt': createdAt.toIso8601String(),
    'messages': messages.map((m) => m.toJson()).toList(),
  };

  factory ChatSession.fromJson(Map<String, dynamic> json) {
    final msgs = json['messages'];
    return ChatSession(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'New Chat',
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.now(),
      messages: msgs is List
          ? msgs
              .whereType<Map>()
              .map((m) => ChatMessage.fromJson(Map<String, dynamic>.from(m)))
              .toList()
          : [],
    );
  }
}

/// Manages multiple chat sessions with SharedPreferences persistence.
class ChatStorage {
  static const _kChatsKey = 'weaveclaw_chats';
  static const _kActiveKey = 'weaveclaw_active_chat';

  static SharedPreferences? _prefs;

  static Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  /// Load all saved chat sessions.
  static List<ChatSession> loadAll() {
    final raw = _prefs?.getString(_kChatsKey);
    if (raw == null || raw.isEmpty) return [];

    try {
      final list = jsonDecode(raw);
      if (list is! List) return [];
      return list
          .whereType<Map>()
          .map((m) => ChatSession.fromJson(Map<String, dynamic>.from(m)))
          .toList();
    } catch (_) {
      return [];
    }
  }

  /// Save all chat sessions.
  static Future<void> saveAll(List<ChatSession> chats) async {
    final json = jsonEncode(chats.map((c) => c.toJson()).toList());
    await _prefs?.setString(_kChatsKey, json);
  }

  /// Get the last active chat ID.
  static String? getActiveChatId() {
    return _prefs?.getString(_kActiveKey);
  }

  /// Set the active chat ID.
  static Future<void> setActiveChatId(String id) async {
    await _prefs?.setString(_kActiveKey, id);
  }
}
