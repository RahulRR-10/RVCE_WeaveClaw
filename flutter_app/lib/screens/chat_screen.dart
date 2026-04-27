import 'package:flutter/material.dart';

import '../models/chat_message.dart';
import '../services/api_service.dart';
import '../widgets/conflict_card.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _sessionId = 'flutter-${DateTime.now().millisecondsSinceEpoch}';
  final List<ChatMessage> _messages = [
    ChatMessage(
      role: 'assistant',
      content: 'Tell me what you want WeaveClaw to automate.',
    ),
  ];
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;

    setState(() {
      _messages.add(ChatMessage(role: 'user', content: text));
      _sending = true;
      _controller.clear();
    });
    _scrollToBottom();

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
  }

  String _formatChatResult(Map<String, dynamic> result) {
    switch (result['type']) {
      case 'skill_created':
        final skill = result['skill'] is Map
            ? Map<String, dynamic>.from(result['skill'] as Map)
            : const <String, dynamic>{};
        return 'Created "${skill['name'] ?? 'new skill'}". It is ready in your Skills tab.';
      case 'skill_executed':
        final status = result['status'] ?? 'done';
        final name = result['skill_name'] ?? 'skill';
        return 'Executed "$name" with status: $status.';
      case 'clarification_needed':
        return result['prompt']?.toString() ?? 'Can you give more details?';
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('WeaveClaw')),
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
                        hintText: 'Try "I am going to sleep"',
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
