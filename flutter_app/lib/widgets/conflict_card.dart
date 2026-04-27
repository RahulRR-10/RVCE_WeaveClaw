import 'package:flutter/material.dart';

class ConflictCard extends StatelessWidget {
  const ConflictCard({
    super.key,
    required this.message,
    required this.options,
    required this.onResolve,
  });

  final String message;
  final List<dynamic> options;
  final ValueChanged<String> onResolve;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      color: theme.colorScheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.warning_amber, color: theme.colorScheme.onErrorContainer),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Conflict detected',
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: theme.colorScheme.onErrorContainer,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: TextStyle(color: theme.colorScheme.onErrorContainer),
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: options.map((option) {
                final map = option is Map ? Map<String, dynamic>.from(option) : {};
                final id = map['id']?.toString() ?? '';
                final label = map['label']?.toString() ?? id;
                return OutlinedButton(
                  onPressed: id.isEmpty ? null : () => onResolve(id),
                  child: Text(label),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}
