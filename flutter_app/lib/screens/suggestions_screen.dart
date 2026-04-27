import 'package:flutter/material.dart';

import '../models/suggestion.dart';
import '../services/api_service.dart';
import '../widgets/suggestion_card.dart';

class SuggestionsScreen extends StatefulWidget {
  const SuggestionsScreen({super.key});

  @override
  State<SuggestionsScreen> createState() => _SuggestionsScreenState();
}

class _SuggestionsScreenState extends State<SuggestionsScreen> {
  List<Suggestion> _suggestions = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSuggestions();
  }

  Future<void> _loadSuggestions() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final rows = await ApiService.getSuggestions();
      if (!mounted) return;
      setState(() {
        _suggestions = rows.map(Suggestion.fromJson).toList();
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

  Future<void> _accept(Suggestion suggestion) async {
    try {
      await ApiService.acceptSuggestion(suggestion.id);
      if (!mounted) return;
      _showSnack('Suggestion accepted');
      await _loadSuggestions();
    } catch (e) {
      if (!mounted) return;
      _showSnack(e.toString());
    }
  }

  Future<void> _dismiss(Suggestion suggestion) async {
    try {
      await ApiService.dismissSuggestion(suggestion.id);
      if (!mounted) return;
      _showSnack('Suggestion dismissed');
      await _loadSuggestions();
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
        title: const Text('Suggestions'),
        actions: [
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loadSuggestions,
            icon: const Icon(Icons.refresh),
          ),
        ],
      ),
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
    if (_suggestions.isEmpty) {
      return RefreshIndicator(
        onRefresh: _loadSuggestions,
        child: ListView(
          children: const [
            SizedBox(height: 160),
            Center(child: Text('No pending suggestions')),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadSuggestions,
      child: ListView.builder(
        padding: const EdgeInsets.only(bottom: 12),
        itemCount: _suggestions.length,
        itemBuilder: (context, index) {
          final suggestion = _suggestions[index];
          return SuggestionCard(
            suggestion: suggestion,
            onAccept: () => _accept(suggestion),
            onDismiss: () => _dismiss(suggestion),
          );
        },
      ),
    );
  }
}
