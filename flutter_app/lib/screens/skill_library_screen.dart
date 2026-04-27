import 'package:flutter/material.dart';

import '../models/skill.dart';
import '../services/api_service.dart';
import '../widgets/skill_card.dart';

class SkillLibraryScreen extends StatefulWidget {
  const SkillLibraryScreen({super.key});

  @override
  State<SkillLibraryScreen> createState() => _SkillLibraryScreenState();
}

class _SkillLibraryScreenState extends State<SkillLibraryScreen> {
  List<Skill> _skills = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSkills();
  }

  Future<void> _loadSkills() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final rows = await ApiService.getSkills();
      if (!mounted) return;
      setState(() {
        _skills = rows.map(Skill.fromJson).toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _execute(Skill skill) async {
    try {
      final result = await ApiService.executeSkill(skill.id);
      if (!mounted) return;
      _showSnack('Executed ${result['skill_name'] ?? skill.name}: ${result['status'] ?? 'done'}');
      await _loadSkills();
    } catch (e) {
      if (!mounted) return;
      _showSnack(e.toString());
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

  Future<void> _delete(Skill skill) async {
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

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Skills'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loadSkills,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return _ErrorView(message: _error!, onRetry: _loadSkills);
    if (_skills.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadSkills,
        child: ListView(
          children: const [
            SizedBox(height: 160),
            Center(child: Text('No skills yet')),
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
            onDelete: () => _delete(skill),
          );
        },
      ),
    );
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
