import 'package:flutter/material.dart';

import '../models/skill.dart';
import '../services/api_service.dart';
import '../widgets/skill_card.dart';

class SkillLibraryScreen extends StatefulWidget {
  const SkillLibraryScreen({super.key});

  @override
  State<SkillLibraryScreen> createState() => _SkillLibraryScreenState();
}

class _SkillLibraryScreenState extends State<SkillLibraryScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  List<Skill> _skills = [];
  List<Map<String, dynamic>> _watchers = [];
  bool _loadingSkills = true;
  bool _loadingWatchers = true;
  String? _skillError;
  String? _watcherError;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadSkills();
    _loadWatchers();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  // ─── Skills ───────────────────────────────────────────────────

  Future<void> _loadSkills() async {
    setState(() {
      _loadingSkills = true;
      _skillError = null;
    });

    try {
      final rows = await ApiService.getSkills();
      if (!mounted) return;
      setState(() {
        _skills = rows.map(Skill.fromJson).toList();
        _loadingSkills = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _skillError = e.toString();
        _loadingSkills = false;
      });
    }
  }

  Future<void> _execute(Skill skill) async {
    try {
      final result = await ApiService.executeSkill(skill.id);
      if (!mounted) return;

      // Build a human-readable summary of what happened
      final status = result['status']?.toString() ?? 'done';
      final name = result['skill_name']?.toString() ?? skill.name;
      final actionsResult = result['actions_result'];
      String detail = '✅ $name — $status';

      if (actionsResult is List && actionsResult.isNotEmpty) {
        final messages = actionsResult
            .where((a) => a is Map && a['response'] is Map)
            .map((a) => (a['response'] as Map)['message']?.toString() ?? '')
            .where((m) => m.isNotEmpty)
            .toList();
        if (messages.isNotEmpty) {
          detail = messages.join('\n');
        }
      }

      _showSnack(detail);
      await _loadSkills();
    } catch (e) {
      if (!mounted) return;
      _showSnack('❌ ${e.toString()}');
    }
  }

  Future<void> _toggle(Skill skill) async {
    try {
      await ApiService.toggleSkill(skill.id);
      await _loadSkills();
    } catch (e) {
      if (!mounted) return;
      _showSnack(e.toString());
    }
  }

  Future<void> _deleteSkill(Skill skill) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Skill'),
        content: Text('Delete "${skill.name}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ApiService.deleteSkill(skill.id);
      await _loadSkills();
    } catch (e) {
      if (!mounted) return;
      _showSnack(e.toString());
    }
  }

  // ─── Watchers ─────────────────────────────────────────────────

  Future<void> _loadWatchers() async {
    setState(() {
      _loadingWatchers = true;
      _watcherError = null;
    });

    try {
      final rows = await ApiService.getWatchers();
      if (!mounted) return;
      setState(() {
        _watchers = rows;
        _loadingWatchers = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _watcherError = e.toString();
        _loadingWatchers = false;
      });
    }
  }

  Future<void> _deleteWatcher(String id, String repo) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Stop Watcher'),
        content: Text('Stop watching "$repo"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Stop'),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    try {
      await ApiService.deleteWatcher(id);
      _showSnack('Stopped watching $repo');
      await _loadWatchers();
    } catch (e) {
      if (!mounted) return;
      _showSnack(e.toString());
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  // ─── Build ────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Skills & Watchers'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: () {
              _loadSkills();
              _loadWatchers();
            },
            icon: const Icon(Icons.refresh),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: [
            Tab(
              icon: const Icon(Icons.auto_awesome_mosaic, size: 18),
              text: 'Skills (${_skills.length})',
            ),
            Tab(
              icon: const Icon(Icons.visibility, size: 18),
              text: 'Watchers (${_watchers.length})',
            ),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildSkillsTab(),
          _buildWatchersTab(),
        ],
      ),
    );
  }

  Widget _buildSkillsTab() {
    if (_loadingSkills) return const Center(child: CircularProgressIndicator());
    if (_skillError != null) {
      return _ErrorView(message: _skillError!, onRetry: _loadSkills);
    }
    if (_skills.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadSkills,
        child: ListView(
          children: const [
            SizedBox(height: 160),
            Center(child: Text('No skills yet. Try chatting to create one!')),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadSkills,
      child: ListView.builder(
        padding: const EdgeInsets.only(bottom: 12),
        itemCount: _skills.length,
        itemBuilder: (context, index) {
          final skill = _skills[index];
          return SkillCard(
            skill: skill,
            onExecute: () => _execute(skill),
            onToggle: () => _toggle(skill),
            onDelete: () => _deleteSkill(skill),
          );
        },
      ),
    );
  }

  Widget _buildWatchersTab() {
    if (_loadingWatchers) return const Center(child: CircularProgressIndicator());
    if (_watcherError != null) {
      return _ErrorView(message: _watcherError!, onRetry: _loadWatchers);
    }
    if (_watchers.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadWatchers,
        child: ListView(
          children: const [
            SizedBox(height: 160),
            Center(
              child: Text(
                'No active watchers.\n\nTry: "watch my github repo"',
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadWatchers,
      child: ListView.builder(
        padding: const EdgeInsets.only(bottom: 12, top: 8),
        itemCount: _watchers.length,
        itemBuilder: (context, index) {
          final w = _watchers[index];
          final config = w['config'] is Map
              ? Map<String, dynamic>.from(w['config'] as Map)
              : <String, dynamic>{};
          final repo = config['repo']?.toString() ?? 'unknown';
          final branch = config['branch']?.toString() ?? 'main';
          final interval = config['poll_interval_seconds'] ?? 60;
          final isActive = w['is_active'] == true || w['is_active'] == 1;
          final lastChecked = w['last_checked_at']?.toString();

          return Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        isActive ? Icons.visibility : Icons.visibility_off,
                        color: isActive
                            ? Theme.of(context).colorScheme.primary
                            : Theme.of(context).disabledColor,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              repo,
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            Text(
                              'Branch: $branch  •  Every ${_formatInterval(interval)}',
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            if (lastChecked != null)
                              Text(
                                'Last checked: $lastChecked',
                                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: Theme.of(context).disabledColor,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Chip(
                        avatar: const Icon(Icons.notifications, size: 16),
                        label: Text(w['notify_via']?.toString() ?? 'in_app'),
                        visualDensity: VisualDensity.compact,
                      ),
                      const Spacer(),
                      FilledButton.tonalIcon(
                        onPressed: () => _deleteWatcher(
                          w['id']?.toString() ?? '',
                          repo,
                        ),
                        icon: const Icon(Icons.stop, size: 18),
                        label: const Text('Stop'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  String _formatInterval(dynamic seconds) {
    final s = seconds is int ? seconds : int.tryParse('$seconds') ?? 60;
    if (s < 60) return '${s}s';
    if (s < 3600) return '${s ~/ 60}m';
    return '${s ~/ 3600}h';
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
