---
id: TASK-007
title: Client-side file validation and error handling
status: done
priority: must
requires: [TASK-005]
ref: AC-5
---

# TASK-007 — Client-side file validation and error handling

## Objective

Add client-side file validation (size, format, resolution) and comprehensive error handling for the upload and OCR flow.

## Why

- AC-5 requires explicit error messages when files exceed 10 Mo or are not JPEG/PNG, blocking upload before it starts.
- NF-005 recommends minimum 1280x960 resolution — show a warning (not blocking) for low-res images.
- OCR failure must be handled gracefully with manual entry fallback.

## Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/(main)/demandes/nouvelle.tsx` | Add validation before upload, error state handling |

## Implementation details

### Pre-upload validation

After capture/gallery selection, before proceeding to `extracting`:

```typescript
import * as FileSystem from 'expo-file-system';
import { Image as RNImage } from 'react-native';

async function validateImage(uri: string): Promise<{ valid: boolean; warnings: string[]; error?: string }> {
  const warnings: string[] = [];

  // 1. Check file size
  const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
  if (!fileInfo.exists) {
    return { valid: false, warnings, error: 'Fichier introuvable' };
  }
  if (fileInfo.size && fileInfo.size > 10 * 1024 * 1024) {
    return { valid: false, warnings, error: 'Le fichier dépasse 10 Mo. Veuillez réduire la taille ou reprendre la photo.' };
  }

  // 2. Check format (from URI extension or MIME)
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext && !['jpg', 'jpeg', 'png'].includes(ext)) {
    return { valid: false, warnings, error: 'Format non supporté. Seuls JPEG et PNG sont acceptés.' };
  }

  // 3. Check resolution (warning only, non-blocking)
  return new Promise(resolve => {
    RNImage.getSize(
      uri,
      (width, height) => {
        if (width < 1280 || height < 960) {
          warnings.push(`Résolution faible (${width}x${height}). Recommandé: 1280x960 minimum pour une meilleure extraction.`);
        }
        resolve({ valid: true, warnings });
      },
      () => resolve({ valid: true, warnings }) // Can't check size, proceed anyway
    );
  });
}
```

### Usage in capture flow

```typescript
const handleCapture = async () => {
  // ... take photo ...
  if (photo?.uri) {
    const validation = await validateImage(photo.uri);
    if (!validation.valid) {
      Alert.alert('Fichier invalide', validation.error!);
      return; // Don't proceed
    }
    if (validation.warnings.length > 0) {
      // Show non-blocking warning
      Alert.alert(
        'Qualité de l\'image',
        validation.warnings.join('\n'),
        [
          { text: 'Reprendre', onPress: () => {} },
          { text: 'Continuer quand même', onPress: () => {
            setCapturedImage(photo.uri);
            setStep('extracting');
          }},
        ]
      );
      return;
    }
    setCapturedImage(photo.uri);
    setStep('extracting');
  }
};
```

### Error handling in extracting step

```typescript
// OCR timeout
const OCR_TIMEOUT_MS = 15000;

const runOcrExtraction = async (imageUri: string) => {
  setOcrLoading(true);
  setOcrError(null);

  try {
    // ... create demande, upload, trigger OCR (with timeout) ...
    const ocrPromise = apiClient.post(`/sante/documents/${docId}/ocr`);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OCR_TIMEOUT')), OCR_TIMEOUT_MS)
    );

    const ocrResp = await Promise.race([ocrPromise, timeoutPromise]);
    // ... handle success ...
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    if (message === 'OCR_TIMEOUT') {
      setOcrError('L\'extraction a pris trop de temps. Vous pouvez remplir les champs manuellement.');
    } else {
      setOcrError('L\'extraction automatique a échoué. Veuillez remplir les champs manuellement.');
    }
  } finally {
    setOcrLoading(false);
    setStep('ocr-review');
  }
};
```

### Error display in ocr-review step

When `ocrError` is set and `ocrData` is null:

```tsx
{ocrError && (
  <View style={styles.errorCard}>
    <Text style={styles.errorText}>{ocrError}</Text>
    <Text style={styles.errorSubtext}>
      Tous les champs sont modifiables ci-dessous.
    </Text>
  </View>
)}
```

### New state variables

```typescript
const [ocrError, setOcrError] = useState<string | null>(null);
```

## Acceptance criteria

- [ ] Files > 10 Mo blocked with explicit error message (AC-5)
- [ ] Non-JPEG/PNG files blocked with explicit error message (AC-5)
- [ ] Low-resolution images show non-blocking warning (NF-005)
- [ ] OCR timeout after 15s → manual entry fallback
- [ ] OCR API failure → manual entry fallback with error message
- [ ] Network error during upload → retry mechanism (from TASK-003)
- [ ] All error messages are in French
