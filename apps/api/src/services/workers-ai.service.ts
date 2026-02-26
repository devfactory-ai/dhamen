/**
 * Workers AI Service
 *
 * Unified interface for using Cloudflare Workers AI models
 * for text analysis, classification, embeddings, and anomaly detection.
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../types';

// Model IDs
const MODELS = {
  textGeneration: '@cf/meta/llama-3.1-8b-instruct',
  textClassification: '@cf/huggingface/distilbert-sst-2-int8',
  embeddings: '@cf/baai/bge-base-en-v1.5',
  summarization: '@cf/facebook/bart-large-cnn',
} as const;

export interface AIAnalysisResult {
  score: number;
  confidence: number;
  reasoning: string;
  flags: string[];
  processingTimeMs: number;
}

export interface ClassificationResult {
  label: string;
  score: number;
}

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
}

/**
 * Workers AI Service Class
 */
export class WorkersAIService {
  private c: Context<{ Bindings: Bindings; Variables: Variables }>;

  constructor(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    this.c = c;
  }

  /**
   * Analyze text for fraud indicators using LLM
   */
  async analyzeFraudIndicators(data: {
    description: string;
    montant: number;
    typeSoin: string;
    historique: string;
  }): Promise<AIAnalysisResult> {
    const startTime = Date.now();

    const prompt = `Tu es un expert en detection de fraude pour les remboursements de soins de sante en Tunisie.

Analyse cette demande de remboursement:
- Type de soin: ${data.typeSoin}
- Montant demande: ${data.montant / 1000} TND
- Description: ${data.description || 'Non fournie'}
- Historique recent: ${data.historique || 'Aucun'}

Evalue le risque de fraude sur une echelle de 0 a 100 (0 = aucun risque, 100 = fraude certaine).

Reponds UNIQUEMENT au format JSON suivant:
{
  "score": <number 0-100>,
  "confidence": <number 0-100>,
  "reasoning": "<explication courte>",
  "flags": ["<indicateur1>", "<indicateur2>"]
}`;

    try {
      const response = await this.runTextGeneration(prompt);
      const parsed = this.parseJSONResponse(response);

      return {
        score: Math.max(0, Math.min(100, parsed.score ?? 0)),
        confidence: Math.max(0, Math.min(100, parsed.confidence ?? 50)),
        reasoning: parsed.reasoning ?? 'Analyse non disponible',
        flags: Array.isArray(parsed.flags) ? parsed.flags : [],
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error('AI fraud analysis failed:', error);
      return {
        score: 0,
        confidence: 0,
        reasoning: 'Erreur lors de l\'analyse IA',
        flags: [],
        processingTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Classify care type from description
   */
  async classifyCareType(description: string): Promise<{
    typeSoin: string;
    confidence: number;
  }> {
    const prompt = `Classifie cette description de soin medical dans une des categories suivantes:
- pharmacie
- consultation
- analyse
- hospitalisation
- dentaire
- optique
- imagerie
- kinesitherapie
- autre

Description: "${description}"

Reponds UNIQUEMENT au format JSON:
{"typeSoin": "<categorie>", "confidence": <0-100>}`;

    try {
      const response = await this.runTextGeneration(prompt);
      const parsed = this.parseJSONResponse(response);

      return {
        typeSoin: parsed.typeSoin ?? 'autre',
        confidence: parsed.confidence ?? 50,
      };
    } catch {
      return { typeSoin: 'autre', confidence: 0 };
    }
  }

  /**
   * Generate summary for bordereau
   */
  async generateBordereauSummary(data: {
    nombreDemandes: number;
    montantTotal: number;
    periodeDebut: string;
    periodeFin: string;
    parTypeSoin: Record<string, number>;
  }): Promise<string> {
    const typesDetails = Object.entries(data.parTypeSoin)
      .map(([type, montant]) => `${type}: ${(montant / 1000).toFixed(3)} TND`)
      .join(', ');

    const prompt = `Redige un resume court (2-3 phrases) en francais pour ce bordereau de remboursement sante:
- Periode: ${data.periodeDebut} a ${data.periodeFin}
- Nombre de demandes: ${data.nombreDemandes}
- Montant total: ${(data.montantTotal / 1000).toFixed(3)} TND
- Repartition par type: ${typesDetails}

Resume:`;

    try {
      return await this.runTextGeneration(prompt, { maxTokens: 150 });
    } catch {
      return `Bordereau du ${data.periodeDebut} au ${data.periodeFin}: ${data.nombreDemandes} demandes pour un total de ${(data.montantTotal / 1000).toFixed(3)} TND.`;
    }
  }

  /**
   * Detect anomalies in claim patterns
   */
  async detectPatternAnomalies(data: {
    adherentId: string;
    demandesRecentes: Array<{
      typeSoin: string;
      montant: number;
      date: string;
    }>;
    demandeActuelle: {
      typeSoin: string;
      montant: number;
      date: string;
    };
  }): Promise<{
    isAnomaly: boolean;
    anomalyScore: number;
    anomalyType: string | null;
    explanation: string;
  }> {
    const historiqueStr = data.demandesRecentes
      .map((d) => `${d.date}: ${d.typeSoin} - ${d.montant / 1000} TND`)
      .join('\n');

    const prompt = `Analyse ce pattern de demandes de remboursement pour detecter des anomalies:

Historique recent (dernieres 30 jours):
${historiqueStr || 'Aucune demande recente'}

Nouvelle demande:
- Date: ${data.demandeActuelle.date}
- Type: ${data.demandeActuelle.typeSoin}
- Montant: ${data.demandeActuelle.montant / 1000} TND

Detecte si cette nouvelle demande presente un pattern anormal.

Reponds UNIQUEMENT au format JSON:
{
  "isAnomaly": <true/false>,
  "anomalyScore": <0-100>,
  "anomalyType": "<type ou null>",
  "explanation": "<explication>"
}`;

    try {
      const response = await this.runTextGeneration(prompt);
      const parsed = this.parseJSONResponse(response);

      return {
        isAnomaly: parsed.isAnomaly === true,
        anomalyScore: parsed.anomalyScore ?? 0,
        anomalyType: parsed.anomalyType ?? null,
        explanation: parsed.explanation ?? '',
      };
    } catch {
      return {
        isAnomaly: false,
        anomalyScore: 0,
        anomalyType: null,
        explanation: 'Analyse non disponible',
      };
    }
  }

  /**
   * Generate text embeddings for similarity search
   */
  async generateEmbeddings(texts: string[]): Promise<EmbeddingResult[]> {
    try {
      // @ts-expect-error - Workers AI types not fully defined
      const response = await this.c.env.AI.run(MODELS.embeddings, {
        text: texts,
      });

      if (response?.data) {
        return response.data.map((vector: number[]) => ({
          vector,
          dimensions: vector.length,
        }));
      }
      return [];
    } catch (error) {
      console.error('Embedding generation failed:', error);
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Run text generation model
   */
  private async runTextGeneration(
    prompt: string,
    options: { maxTokens?: number; temperature?: number } = {}
  ): Promise<string> {
    const { maxTokens = 500, temperature = 0.3 } = options;

    // @ts-expect-error - Workers AI types not fully defined
    const response = await this.c.env.AI.run(MODELS.textGeneration, {
      prompt,
      max_tokens: maxTokens,
      temperature,
    });

    return response?.response ?? '';
  }

  /**
   * Parse JSON from LLM response
   */
  private parseJSONResponse(response: string): Record<string, unknown> {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {};
    }

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return {};
    }
  }
}

/**
 * Create Workers AI Service instance
 */
export function createWorkersAIService(
  c: Context<{ Bindings: Bindings; Variables: Variables }>
): WorkersAIService {
  return new WorkersAIService(c);
}
