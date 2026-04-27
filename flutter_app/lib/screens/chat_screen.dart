import 'dart:async';
import 'package:flutter/material.dart';

import '../models/chat_message.dart';
import '../services/api_service.dart';
import '../services/chat_storage.dart';
import '../widgets/conflict_card.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();

  // Multi-chat state
  List<ChatSession> _chats = [];
  ChatSession? _activeChat;
  bool _storageReady = false;

  bool _sending = false;

  // Notification polling
  Timer? _notifTimer;
  int _unreadCount = 0;
  final Set<String> _seenNotifIds = {};
  late final DateTime _initTime;

  List<ChatMessage> get _messages => _activeChat?.messages ?? [];
  String get _sessionId => _activeChat?.sessionId ?? 'flutter-default';

  @override
  void initState() {
    super.initState();
    _initTime = DateTime.now().toUtc();
    _notifTimer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => _pollNotifications(),
    );
    _initStorage();
  }

  Future<void> _initStorage() async {
    await ChatStorage.init();
    final loaded = ChatStorage.loadAll();
    final activeId = ChatStorage.getActiveChatId();

    setState(() {
      _chats = loaded;
      if (_chats.isNotEmpty) {
        _activeChat = _chats.firstWhere(
          (c) => c.id == activeId,
          orElse: () => _chats.first,
        );
      } else {
        _createNewChat(save: false);
      }
      _storageReady = true;
    });

    // Fetch notifications after storage is ready
    Future.microtask(() => _pollNotifications());
  }

  void _createNewChat({bool save = true}) {
    final id = DateTime.now().millisecondsSinceEpoch.toString();
    final chat = ChatSession(
      id: id,
      title: 'New Chat',
      createdAt: DateTime.now(),
      messages: [
        ChatMessage(
          role: 'assistant',
          content: 'Tell me what you want WeaveClaw to automate.',
        ),
      ],
    );
    setState(() {
      _chats.insert(0, chat);
      _activeChat = chat;
    });
    if (save) _persist();
  }

  void _switchChat(ChatSession chat) {
    setState(() => _activeChat = chat);
    ChatStorage.setActiveChatId(chat.id);
    Navigator.pop(context); // close drawer
    _scrollToBottom();
  }

  Future<void> _deleteChat(ChatSession chat) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Chat'),
        content: Text('Delete "${chat.title}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() {
      _chats.remove(chat);
      if (_activeChat?.id == chat.id) {
        if (_chats.isNotEmpty) {
          _activeChat = _chats.first;
        } else {
          _createNewChat(save: false);
        }
      }
    });
    _persist();
  }

  void _renameChat(ChatSession chat) {
    final renameController = TextEditingController(text: chat.title);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rename Chat'),
        content: TextField(
          controller: renameController,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Chat name'),
          onSubmitted: (_) {
            Navigator.pop(ctx);
            setState(() => chat.title = renameController.text.trim());
            _persist();
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(ctx);
              setState(() => chat.title = renameController.text.trim());
              _persist();
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  Future<void> _persist() async {
    await ChatStorage.saveAll(_chats);
    if (_activeChat != null) {
      await ChatStorage.setActiveChatId(_activeChat!.id);
    }
  }

  @override
  void dispose() {
    _notifTimer?.cancel();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  // ─── Chat logic ──────────────────────────────────────────────

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending || _activeChat == null) return;

    setState(() {
      _messages.add(ChatMessage(role: 'user', content: text));
      _sending = true;
      _controller.clear();
    });
    _scrollToBottom();

    // Auto-title on first user message
    if (_activeChat!.title == 'New Chat' && _messages.where((m) => m.role == 'user').length == 1) {
      _activeChat!.title = text.length > 30 ? '${text.substring(0, 30)}...' : text;
    }

    try {
      final result = await ApiService.sendChat(text, _sessionId);
      if (!mounted) return;
      setState(() {
        _messages.add(
          ChatMessage(
            role: 'assistant',
            content: _formatChatResult(result),
            payload: result,
            isError: result['type'] == 'error' || result['status_code'] >= 400,
          ),
        );
        _sending = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _messages.add(
          ChatMessage(role: 'assistant', content: e.toString(), isError: true),
        );
        _sending = false;
      });
    }
    _scrollToBottom();
    _persist();
  }

  String _formatChatResult(Map<String, dynamic> result) {
    switch (result['type']) {
      case 'skill_created':
        final skill = result['skill'] is Map
            ? Map<String, dynamic>.from(result['skill'] as Map)
            : const <String, dynamic>{};
        return 'Created "${skill['name'] ?? 'new skill'}". It is ready in your Skills tab.';
      case 'skill_executed':
        final execResult = result['result'] is Map
            ? Map<String, dynamic>.from(result['result'] as Map)
            : result;
        final status = execResult['status'] ?? result['status'] ?? 'done';
        final name = execResult['skill_name'] ?? result['skill_name'] ?? 'skill';
        return 'Executed "$name" with status: $status.';
      case 'watcher_created':
        return result['message']?.toString() ??
            'Watcher set up successfully!';
      case 'clarification_needed':
        return result['prompt']?.toString() ??
            result['question']?.toString() ??
            'Can you give more details?';
      case 'conflict_detected':
        final conflict = result['conflict'] is Map
            ? Map<String, dynamic>.from(result['conflict'] as Map)
            : const <String, dynamic>{};
        return conflict['conflict_detail']?.toString() ??
            'This automation conflicts with an active skill.';
      case 'duplicate_skill':
        return result['message']?.toString() ??
            'A skill with this trigger already exists.';
      case 'validation_error':
        final errors = result['errors'];
        return errors is List ? errors.join('\n') : 'Validation failed.';
      case 'error':
        return result['message']?.toString() ??
            result['reason']?.toString() ??
            'Something went wrong.';
      default:
        if (result['error'] != null) return result['error'].toString();
        if (result['message'] != null) return result['message'].toString();
        return 'Done.';
    }
  }

  Future<void> _resolveConflict(Map<String, dynamic> payload, String option) async {
    final conflict = payload['conflict'] is Map
        ? Map<String, dynamic>.from(payload['conflict'] as Map)
        : const <String, dynamic>{};
    final conflictingId = conflict['conflicting_skill_id']?.toString();
    if (conflictingId == null || conflictingId.isEmpty) return;

    try {
      final result = await ApiService.resolveConflict(
        newSkill: const {},
        conflictingId: conflictingId,
        resolution: option,
        conflictType: conflict['conflict_type']?.toString(),
      );
      if (!mounted) return;
      setState(() {
        _messages.add(
          ChatMessage(
            role: 'assistant',
            content: result['message']?.toString() ?? 'Conflict resolution saved.',
          ),
        );
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _messages.add(ChatMessage(role: 'assistant', content: e.toString(), isError: true));
      });
    }
    _scrollToBottom();
    _persist();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    });
  }

  // ─── Notification polling ────────────────────────────────────

  Future<void> _pollNotifications() async {
    try {
      final notifications = await ApiService.getNotifications(limit: 20);
      if (!mounted) return;

      int newUnread = 0;
      for (final notif in notifications) {
        final id = notif['id']?.toString() ?? '';
        final isRead = notif['is_read'] == true || notif['is_read'] == 1;

        if (!isRead) newUnread++;

        if (id.isNotEmpty && !_seenNotifIds.contains(id)) {
          _seenNotifIds.add(id);

          final createdAt = notif['created_at']?.toString();
          bool isNew = false;
          if (createdAt != null) {
            try {
              final dt = DateTime.parse(createdAt);
              isNew = dt.isAfter(_initTime.subtract(const Duration(seconds: 5)));
            } catch (_) {}
          }

          if (isNew) {
            final title = notif['title']?.toString() ?? '';
            final body = notif['body']?.toString() ?? '';
            if (title.isNotEmpty) {
              setState(() {
                _messages.add(ChatMessage(
                  role: 'assistant',
                  content: '🔔 $title\n$body',
                ));
              });
              _scrollToBottom();
              if (!isRead && id.isNotEmpty) {
                ApiService.markNotificationRead(id);
              }
            }
          }
        }
      }

      setState(() => _unreadCount = newUnread);
    } catch (_) {}
  }

  void _showNotifications() async {
    List<Map<String, dynamic>> notifications = [];
    try {
      notifications = await ApiService.getNotifications(limit: 50);
    } catch (_) {}

    if (!mounted) return;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.6,
        maxChildSize: 0.9,
        builder: (_, scrollController) {
          if (notifications.isEmpty) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text('No notifications yet.'),
              ),
            );
          }
          return ListView.builder(
            controller: scrollController,
            padding: const EdgeInsets.all(16),
            itemCount: notifications.length + 1,
            itemBuilder: (context, index) {
              if (index == 0) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    'Notifications',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                );
              }
              final notif = notifications[index - 1];
              final isRead = notif['is_read'] == true || notif['is_read'] == 1;
              final metadata = notif['metadata'] is Map
                  ? Map<String, dynamic>.from(notif['metadata'] as Map)
                  : <String, dynamic>{};
              return Card(
                child: ListTile(
                  leading: Icon(
                    Icons.commit,
                    color: isRead ? null : Theme.of(context).colorScheme.primary,
                  ),
                  title: Text(
                    notif['title']?.toString() ?? 'Notification',
                    style: TextStyle(
                      fontWeight: isRead ? FontWeight.normal : FontWeight.bold,
                    ),
                  ),
                  subtitle: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(notif['body']?.toString() ?? ''),
                      if (metadata['repo'] != null)
                        Text(
                          '${metadata['repo']} • ${metadata['branch'] ?? 'main'}',
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                    ],
                  ),
                  trailing: Text(
                    _timeAgo(notif['created_at']?.toString()),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                  onTap: () {
                    final id = notif['id']?.toString() ?? '';
                    if (id.isNotEmpty && !isRead) {
                      ApiService.markNotificationRead(id);
                      setState(() => _unreadCount = (_unreadCount - 1).clamp(0, 999));
                    }
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }

  String _timeAgo(String? iso) {
    if (iso == null) return '';
    try {
      final dt = DateTime.parse(iso);
      final diff = DateTime.now().difference(dt);
      if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      return '${diff.inDays}d ago';
    } catch (_) {
      return '';
    }
  }

  // ─── Build ───────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (!_storageReady) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        leading: Builder(
          builder: (ctx) => IconButton(
            icon: const Icon(Icons.menu),
            tooltip: 'Chats',
            onPressed: () => Scaffold.of(ctx).openDrawer(),
          ),
        ),
        title: Text(
          _activeChat?.title ?? 'WeaveClaw',
          overflow: TextOverflow.ellipsis,
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_comment_outlined),
            tooltip: 'New Chat',
            onPressed: () {
              _createNewChat();
              _scrollToBottom();
            },
          ),
          Stack(
            children: [
              IconButton(
                icon: const Icon(Icons.notifications_outlined),
                tooltip: 'Notifications',
                onPressed: _showNotifications,
              ),
              if (_unreadCount > 0)
                Positioned(
                  right: 6,
                  top: 6,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.error,
                      shape: BoxShape.circle,
                    ),
                    child: Text(
                      '$_unreadCount',
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      drawer: _buildChatDrawer(),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
              itemCount: _messages.length + (_sending ? 1 : 0),
              itemBuilder: (context, index) {
                if (_sending && index == _messages.length) {
                  return const _TypingBubble();
                }
                return _MessageBubble(
                  message: _messages[index],
                  onResolveConflict: _resolveConflict,
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      onSubmitted: (_) => _send(),
                      decoration: const InputDecoration(
                        hintText: 'Try "set an alarm at 6am and play music"',
                        border: OutlineInputBorder(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: 'Send',
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildChatDrawer() {
    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  Icon(
                    Icons.chat_bubble,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                  const SizedBox(width: 12),
                  Text(
                    'Chats',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const Spacer(),
                  IconButton.filledTonal(
                    icon: const Icon(Icons.add, size: 20),
                    tooltip: 'New Chat',
                    onPressed: () {
                      _createNewChat();
                      Navigator.pop(context);
                    },
                  ),
                ],
              ),
            ),
            const Divider(),

            // Chat list
            Expanded(
              child: _chats.isEmpty
                  ? const Center(child: Text('No chats yet'))
                  : ListView.builder(
                      itemCount: _chats.length,
                      itemBuilder: (context, index) {
                        final chat = _chats[index];
                        final isActive = chat.id == _activeChat?.id;
                        final msgCount = chat.messages.where((m) => m.role == 'user').length;

                        return ListTile(
                          selected: isActive,
                          leading: Icon(
                            isActive ? Icons.chat_bubble : Icons.chat_bubble_outline,
                            size: 20,
                          ),
                          title: Text(
                            chat.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                            ),
                          ),
                          subtitle: Text(
                            '$msgCount messages  •  ${_timeAgo(chat.createdAt.toIso8601String())}',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                          trailing: PopupMenuButton<String>(
                            itemBuilder: (_) => [
                              const PopupMenuItem(
                                value: 'rename',
                                child: Row(
                                  children: [
                                    Icon(Icons.edit, size: 18),
                                    SizedBox(width: 8),
                                    Text('Rename'),
                                  ],
                                ),
                              ),
                              const PopupMenuItem(
                                value: 'delete',
                                child: Row(
                                  children: [
                                    Icon(Icons.delete_outline, size: 18),
                                    SizedBox(width: 8),
                                    Text('Delete'),
                                  ],
                                ),
                              ),
                            ],
                            onSelected: (action) {
                              if (action == 'rename') _renameChat(chat);
                              if (action == 'delete') _deleteChat(chat);
                            },
                          ),
                          onTap: () => _switchChat(chat),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.onResolveConflict,
  });

  final ChatMessage message;
  final Future<void> Function(Map<String, dynamic>, String) onResolveConflict;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isUser = message.role == 'user';
    final payload = message.payload;
    final isConflict = payload?['type'] == 'conflict_detected';

    if (isConflict && payload != null) {
      final conflict = payload['conflict'] is Map
          ? Map<String, dynamic>.from(payload['conflict'] as Map)
          : const <String, dynamic>{};
      return Align(
        alignment: Alignment.centerLeft,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: ConflictCard(
            message: message.content,
            options: conflict['resolution_options'] is List
                ? conflict['resolution_options'] as List<dynamic>
                : const [],
            onResolve: (option) => onResolveConflict(payload, option),
          ),
        ),
      );
    }

    final color = isUser
        ? theme.colorScheme.primaryContainer
        : message.isError
            ? theme.colorScheme.errorContainer
            : theme.colorScheme.surfaceContainerHighest;
    final textColor = isUser
        ? theme.colorScheme.onPrimaryContainer
        : message.isError
            ? theme.colorScheme.onErrorContainer
            : theme.colorScheme.onSurface;

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 5),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(message.content, style: TextStyle(color: textColor)),
        ),
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble();

  @override
  Widget build(BuildContext context) {
    return const Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 6, vertical: 10),
        child: SizedBox(
          width: 22,
          height: 22,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
    );
  }
}
