/**
 * staff-photos.js - 사진 업로드 + 라이트박스
 */

// ════════════════════════════════════════════════════
// 라이트박스
// ════════════════════════════════════════════════════

function openLightbox(url, caption) {
  $('lightboxImg').src = url;
  $('lightboxCaption').textContent = caption || '';
  $('lightbox').classList.add('show');
}

function closeLightbox() {
  $('lightbox').classList.remove('show');
  $('lightboxImg').src = '';
}


// ════════════════════════════════════════════════════
// 사진 업로드
// ════════════════════════════════════════════════════

function triggerPhotoUpload(companyId, noteId) {
  pendingPhotoCompanyId = companyId;
  pendingPhotoNoteId = noteId || null;
  $('photoFileInput').value = '';
  $('photoFileInput').click();
}

async function handlePhotoSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  const companyId = pendingPhotoCompanyId;
  if (!companyId) return;

  // 파일 크기 체크 (10MB)
  if (file.size > 10 * 1024 * 1024) {
    return toast('파일 크기는 10MB 이하여야 합니다.', 'error');
  }

  // 이미지 타입 체크
  if (!file.type.startsWith('image/')) {
    return toast('이미지 파일만 업로드 가능합니다.', 'error');
  }

  toast('업로드 중...');

  try {
    // 1) company_notes 레코드 확인/생성
    let noteId = pendingPhotoNoteId;
    if (!noteId) {
      // 노트가 없으면 새로 생성
      const { data: newNote, error: noteErr } = await sb.from('company_notes').insert({
        company_id: companyId,
        updated_by: currentWorker.id,
      }).select().single();

      if (noteErr) {
        // 이미 존재할 수 있으므로 조회 시도
        const { data: existing } = await sb.from('company_notes')
          .select('id')
          .eq('company_id', companyId)
          .single();
        if (existing) {
          noteId = existing.id;
        } else {
          return toast('메모 생성 실패: ' + noteErr.message, 'error');
        }
      } else {
        noteId = newNote.id;
        // 로컬 데이터에도 추가
        staffData.notes.push(newNote);
      }
    }

    // 2) Supabase Storage 업로드
    const ext = file.name.split('.').pop().toLowerCase();
    const timestamp = Date.now();
    const storagePath = `${companyId}/${timestamp}.${ext}`;

    const { error: uploadErr } = await sb.storage
      .from('note-photos')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadErr) {
      return toast('업로드 실패: ' + uploadErr.message, 'error');
    }

    // 3) company_note_photos 레코드 INSERT
    const caption = '';
    const { data: photoRow, error: insertErr } = await sb.from('company_note_photos').insert({
      note_id:      noteId,
      company_id:   companyId,
      storage_path: storagePath,
      caption:      caption,
      uploaded_by:  currentWorker.id,
    }).select().single();

    if (insertErr) {
      return toast('사진 기록 저장 실패: ' + insertErr.message, 'error');
    }

    // 4) 로컬 데이터 갱신
    if (photoRow) staffData.photos.push(photoRow);

    toast('사진이 업로드되었습니다');

    // 5) 모달 갱신
    await openCompanyDetail(companyId);

  } catch (e) {
    console.error('Photo upload error:', e);
    toast('업로드 중 오류가 발생했습니다.', 'error');
  }
}
