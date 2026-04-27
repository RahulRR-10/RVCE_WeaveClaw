import 'package:flutter/material.dart';

import '../models/suggestion.dart';

class SuggestionCard extends StatelessWidget {
  const SuggestionCard({
    super.key,
    required this.suggestion,
    required this.onAccept,
    required this.onDismiss,
  });

  final Suggestion suggestion;
  final VoidCallback onAccept;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final percent = (suggestion.confidenceScore * 100).round();
    final executionCount = suggestion.evidenceSummary['execution_count'];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    suggestion.title,
                    style: theme.textTheme.titleMedium,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Chip(
                  avatar: const Icon(Icons.trending_up, size: 16),
                  label: Text('$percent%'),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(suggestion.description, style: theme.textTheme.bodyMedium),
            if (executionCount != null) ...[
              const SizedBox(height: 6),
              Text(
                '$executionCount matching executions observed',
                style: theme.textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                FilledButton.icon(
                  onPressed: onAccept,
                  icon: const Icon(Icons.check, size: 18),
                  label: const Text('Accept'),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: onDismiss,
                  icon: const Icon(Icons.close, size: 18),
                  label: const Text('Dismiss'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
