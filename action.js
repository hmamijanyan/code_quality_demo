export function changeTimedText(
  trackId: string,
  ttId: string,
  changes: Partial<ITTModel>,
  analogue: boolean = false,
  forceCreateRevision: boolean = true,
  disableRevised: boolean = false,
  shouldRegisterInUndoStack: boolean = true
) {
  return (dispatch: IAppDispatch, getState: () => IAppState) => {
    const state = getState();
    const rc = SferaProject.getRuntimeConfig();
    let hasChanged = false;
    const fieldsOfTtModel = (names: (keyof ITTModel)[]) => names;
    const FIELDS_NOT_AFFECTED_CHANGE_TT: (string)[] = fieldsOfTtModel([
      'isFocused',
      'noteFocused',
      'activeOnWaveform',
      'isTextRevised',
      'isAnnotationRevised',
      'isTextRevisedManually',
      'isAnnotationRevisedManually'
    ]);

    const isValuableChange = Object.keys(changes).find(x => !FIELDS_NOT_AFFECTED_CHANGE_TT.includes(x));
    const textTrack = selectors.textTrack.getTextTrackBy(TextTrackSearchType.TrackId, state.textTracks, trackId);
    const changedTT: ITTModel = textTrack && textTrack.timedTexts.find(it => it.id === ttId);
    const frameRate = projectSelectors.getFrameRate(state.project);
    const deliverySpecs = state.configuration && state.configuration.deliverySpecs;
    const maxLines: number = utils.tt.getRowMaxLinesLimit(changedTT, textTrack, rc, deliverySpecs);
    const difference: string[] = utils.characterTag.getRemovedCharacters(changedTT.characters, changes.characters);

    // only if exists affected keys
    if (forceCreateRevision && isValuableChange) {
      const projectId = state.project.project_id;
      //compare text with test with same index in neighbor row
      changes = checkRevisionChanged(trackId, ttId, changes, state.textTracks, frameRate, projectId);
      // console.error(changes);
      //show Changed Button
      changes = showChangedButton(trackId, ttId, changes, state);
      // console.error(changes);

      Object.keys(changes).map(change => {
        hasChanged = hasChanged || (changes && changedTT && changes[change] !== changedTT[change]);
      });

      dispatch(toggleProjectChanges(hasChanged));
    }

    const track = selectors.textTrack.getEditableTrack(state.textTracks);
    if (track && track.id === trackId) {
      utils.tt.autoSetQCErrorType(
        {
          ...changedTT,
          ...changes
        },
        state.project.errorTags,
        rc,
        state.textTracks,
        state.user && state.user.id,
        changes,
        frameRate
      );
    }

    let result = getInfoForChangeTimedText(
      trackId,
      ttId,
      changes,
      analogue,
      forceCreateRevision,
      disableRevised,
      state
    );

    if (state.project && state.project.unsavedChanges !== result.hasChanged) {
      dispatch(toggleProjectChanges(result.hasChanged));
    }

    const {isTeletextModeEnabled, ttGrid} = state.configuration;

    if (rc.checkChangesOnly() && result.hasChanged) {
      result.changes = {...result.changes, isChanged: true};
    }

    // let newText = result.changes.text;
    // if (newText && utils.text.isLinesCountChanged(changedTT.text, newText)) {
    //   newText = utils.text.trimEachLine(newText);
    // }

    if (
      result.changes && // TT-APP-20E - Cannot read property 'rowType' of undefined
      result.changes.rowType &&
      utils.tags.hasTag(result.changes.rowType, TTRowType.LANGUAGE_TAG)
    ) {
      const langTagText = utils.langTag.getLangTag(
        {
          client: rc.conf.projectClient,
          contentType: rc.conf.contentType,
          langCode: textTrack.langCode,
          serviceType: utils.tt.getServiceType(rc, textTrack, state.project.files)
        },
        state.langTagData
      );
      if (langTagText) {
        result.changes.text = langTagText;
      }
    }

    const timedText = track && selectors.timedText.getTimedText([track], track.id, ttId);
    const allSelectedErrorsAutomatically = timedText && selectors.error.autoSelectedErrors(timedText);
    if (allSelectedErrorsAutomatically) {
      result.changes = {...result.changes, selectedErrors: null};
    }

    dispatch({
      type: CHANGE_TIMED_TEXTS,
      payload: [
        {
          trackId,
          ttId,
          changes: result.changes,
          isTeletextModeEnabled,
          maxLines
        }
      ],
      meta: shouldRegisterInUndoStack && result.isValuableChange && result.hasChanged && !analogue && UNDOABLE_META
    } as Action<CHANGE_TIMED_TEXTS>);

    const isTimeChanged = result.changes && (result.changes.start !== undefined || result.changes.end !== undefined);
    if (ttGrid && ttGrid.alignment === ALIGNMENT.TIMECODE && isTimeChanged) {
      dispatch(changeAlignment(ALIGNMENT.TIMECODE));
    }

    if (changes.start !== undefined || changes.end !== undefined) {
      dispatch(restartReviewTasks(trackId));
    }

    if (difference.length) {
      const changedTrack = getState().textTracks.find(it => it.id === trackId);
      difference.forEach(tag => {
        if (utils.characterTag.isCharacterExists(changedTrack, tag)) {
          dispatch(deleteCharacterTag(trackId, tag));
        }
      });
    }
  };
}