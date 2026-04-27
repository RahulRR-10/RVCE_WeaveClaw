import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

import '../services/api_service.dart';

class CommunityHubScreen extends StatefulWidget {
  const CommunityHubScreen({super.key});

  @override
  State<CommunityHubScreen> createState() => _CommunityHubScreenState();
}

class _CommunityHubScreenState extends State<CommunityHubScreen> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _skills = [];
  List<Map<String, dynamic>> _filtered = [];
  List<String> _tags = const ['All'];
  String _selectedTag = 'All';
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadHubSkills();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadHubSkills() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final raw = await rootBundle.loadString('assets/mock_hub_skills.json');
      final decoded = jsonDecode(raw);
      final rows = decoded is List
          ? decoded
              .whereType<Map>()
              .map((item) => Map<String, dynamic>.from(item))
              .toList()
          : <Map<String, dynamic>>[];
      final tags = rows
          .expand((skill) => (skill['tags'] is List ? skill['tags'] as List : const []))
          .map((tag) => tag.toString())
          .toSet()
          .toList()
        ..sort();

      if (!mounted) return;
      setState(() {
        _skills = rows;
        _tags = ['All', ...tags];
        _loading = false;
      });
      _filter();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _filter() {
    final query = _searchController.text.trim().toLowerCase();
    setState(() {
      _filtered = _skills.where((skill) {
        final name = skill['name']?.toString().toLowerCase() ?? '';
        final description = skill['description']?.toString().toLowerCase() ?? '';
        final tags = skill['tags'] is List ? skill['tags'] as List : const [];
        final matchesTag = _selectedTag == 'All' ||
            tags.map((tag) => tag.toString()).contains(_selectedTag);
        final matchesSearch = query.isEmpty ||
            name.contains(query) ||
            description.contains(query) ||
            tags.any((tag) => tag.toString().toLowerCase().contains(query));
        return matchesTag && matchesSearch;
      }).toList();
    });
  }

  Future<void> _import(Map<String, dynamic> hubSkill) async {
    final skill = _normalizeHubSkill(hubSkill);
    try {
      final result = await ApiService.importHubSkill(skill);
      if (!mounted) return;
      final status = result['status_code'] is int ? result['status_code'] as int : 0;
      if (status >= 200 && status < 300 && result['error'] == null) {
        _showSnack('"${hubSkill['name']}" imported');
      } else if (result['error'] == 'device_mismatch' || status == 422) {
        _showImportWarning(hubSkill, result);
      } else {
        _showSnack(result['message']?.toString() ?? result['error']?.toString() ?? 'Import failed');
      }
    } catch (e) {
      if (!mounted) return;
      _showSnack(e.toString());
    }
  }

  Future<void> _importWithWarningAcknowledged(Map<String, dynamic> hubSkill) async {
    final skill = _normalizeHubSkill(hubSkill, acknowledgeWarnings: true);
    try {
      final result = await ApiService.importHubSkill(skill);
      if (!mounted) return;
      final status = result['status_code'] is int ? result['status_code'] as int : 0;
      if (status >= 200 && status < 300 && result['error'] == null) {
        _showSnack('"${hubSkill['name']}" imported in simulation mode');
      } else {
        _showSnack(result['message']?.toString() ?? result['error']?.toString() ?? 'Import failed');
      }
    } catch (e) {
      if (!mounted) return;
      _showSnack(e.toString());
    }
  }

  Map<String, dynamic> _normalizeHubSkill(
    Map<String, dynamic> hubSkill, {
    bool acknowledgeWarnings = false,
  }) {
    final trigger = hubSkill['trigger'] is Map
        ? Map<String, dynamic>.from(hubSkill['trigger'] as Map)
        : <String, dynamic>{};
    final extra = trigger['extra'] is Map
        ? Map<String, dynamic>.from(trigger['extra'] as Map)
        : <String, dynamic>{};

    final normalizedTrigger = _compact({
      'type': trigger['type'],
      'value': trigger['value'],
      'source': trigger['source'],
      'event': trigger['event'],
      'recurrence': trigger['recurrence'] ?? extra['recurrence'],
      'repo': trigger['repo'] ?? extra['repo'],
    });

    final actions = hubSkill['actions'] is List
        ? (hubSkill['actions'] as List)
            .whereType<Map>()
            .map((item) => Map<String, dynamic>.from(item))
            .toList()
        : <Map<String, dynamic>>[];

    return _compact({
      'name': hubSkill['name'],
      'description': hubSkill['description'],
      'trigger': normalizedTrigger,
      'conditions': hubSkill['conditions'] is List ? hubSkill['conditions'] : <dynamic>[],
      'actions': actions,
      'source': 'community_imported',
      'tags': hubSkill['tags'] is List ? hubSkill['tags'] : <dynamic>[],
      if (acknowledgeWarnings) 'acknowledge_warnings': true,
    });
  }

  Map<String, dynamic> _compact(Map<String, dynamic> input) {
    return Map.fromEntries(
      input.entries.where((entry) => entry.value != null),
    );
  }

  void _showImportWarning(Map<String, dynamic> hubSkill, Map<String, dynamic> result) {
    final warnings = result['warnings'] is List ? result['warnings'] as List : const [];
    final requiredDevices = hubSkill['required_devices'] is List
        ? (hubSkill['required_devices'] as List).map((item) => item.toString()).join(', ')
        : 'none';

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning_amber, color: Colors.orange),
            SizedBox(width: 8),
            Text('Import Warning'),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(result['message']?.toString() ?? 'This skill needs simulation mode.'),
              const SizedBox(height: 10),
              if (warnings.isNotEmpty) ...[
                ...warnings.map((warning) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('- ${warning.toString()}'),
                    )),
                const SizedBox(height: 8),
              ],
              Text('Required devices: $requiredDevices'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton.icon(
            onPressed: () {
              Navigator.pop(context);
              _importWithWarningAcknowledged(hubSkill);
            },
            icon: const Icon(Icons.download),
            label: const Text('Import in Sim Mode'),
          ),
        ],
      ),
    );
  }

  void _publish(Map<String, dynamic> hubSkill) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Publish Skill'),
        content: Text(
          '"${hubSkill['name']}" will be anonymised before publishing. Personal identifiers are not shared.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.pop(context);
              _showSnack('Skill published to the community hub');
            },
            child: const Text('Publish'),
          ),
        ],
      ),
    );
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Community Hub')),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(_error!, textAlign: TextAlign.center),
        ),
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: TextField(
            controller: _searchController,
            onChanged: (_) => _filter(),
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Search skills',
              border: OutlineInputBorder(),
            ),
          ),
        ),
        SizedBox(
          height: 42,
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            scrollDirection: Axis.horizontal,
            itemBuilder: (context, index) {
              final tag = _tags[index];
              return ChoiceChip(
                label: Text(tag),
                selected: _selectedTag == tag,
                onSelected: (_) {
                  _selectedTag = tag;
                  _filter();
                },
              );
            },
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemCount: _tags.length,
          ),
        ),
        const SizedBox(height: 6),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _loadHubSkills,
            child: ListView.builder(
              padding: const EdgeInsets.only(bottom: 12),
              itemCount: _filtered.length,
              itemBuilder: (context, index) => _HubSkillCard(
                skill: _filtered[index],
                onImport: () => _import(_filtered[index]),
                onPublish: () => _publish(_filtered[index]),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _HubSkillCard extends StatelessWidget {
  const _HubSkillCard({
    required this.skill,
    required this.onImport,
    required this.onPublish,
  });

  final Map<String, dynamic> skill;
  final VoidCallback onImport;
  final VoidCallback onPublish;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tags = skill['tags'] is List ? skill['tags'] as List : const [];
    final requiredDevices =
        skill['required_devices'] is List ? skill['required_devices'] as List : const [];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    skill['name']?.toString() ?? 'Community Skill',
                    style: theme.textTheme.titleMedium,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('${skill['rating'] ?? '-'} stars', style: theme.textTheme.labelMedium),
                    Text('${skill['import_count'] ?? 0} imports', style: theme.textTheme.labelSmall),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(skill['description']?.toString() ?? ''),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: tags
                  .map((tag) => Chip(
                        label: Text(tag.toString()),
                        materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        visualDensity: VisualDensity.compact,
                      ))
                  .toList(),
            ),
            if (requiredDevices.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                'Needs: ${requiredDevices.map((item) => item.toString()).join(', ')}',
                style: theme.textTheme.bodySmall?.copyWith(color: Colors.orangeAccent),
              ),
            ],
            const SizedBox(height: 12),
            Row(
              children: [
                FilledButton.icon(
                  onPressed: onImport,
                  icon: const Icon(Icons.download, size: 18),
                  label: const Text('Import'),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: onPublish,
                  icon: const Icon(Icons.publish, size: 18),
                  label: const Text('Publish'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
