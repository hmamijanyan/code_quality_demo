    [CHANGE_TIMED_TEXTS]: (state: ITextTrack[], action: Action<CHANGE_TIMED_TEXTS>): ITextTrack[] => {
      let newState = state.map(track => {
        let isProfanityChecked = false;
        let isSpellChecked = track.isSpellChecked;
        let isQualityChecked = track.isQualityChecked;
        let isSiblingConsistencyChecked = track.isSiblingConsistencyChecked;
        let revisionUpdates = track.revisionUpdates;
        let timedTexts = [...track.timedTexts];

        for (let i = 0, ilen = action.payload.length; i < ilen; i++) {
          let changedTT = action.payload[i];

          const machineTranslationTrack = selectors.textTrack.getMachineTranslationTrack([track]);
          if (machineTranslationTrack && changedTT.changes.text !== undefined) {
            const targetTimedText = selectors.timedText.getTimedText(state, changedTT.trackId, changedTT.ttId);
            const mtTimedText = selectors.timedText.findByRowKey(machineTranslationTrack, targetTimedText.rowKey);
            timedTexts = timedTexts.map(tt => {
              if (tt === mtTimedText) {
                return {
                  ...tt
                };
              } else {
                return tt;
              }
            });
          }

          if (changedTT.trackId === track.id) {
            let changes = {...changedTT.changes, anyRealTimeChange: true};
            const timeChanges = changes.start !== undefined || changes.end !== undefined;

            let ttIndex = timedTexts.findIndex(tt => tt.id === changedTT.ttId);
            let tt = timedTexts[ttIndex];
            let newOverlap = tt && tt.overlap;

            if (timeChanges && tt) {
              let scriptPrev = timedTexts[ttIndex - 1];
              let scriptNext = timedTexts[ttIndex + 1];

              if (changes.start) {
                changes.start = utils.number.roundNumber(changes.start, 3);
              }

              if (changes.end) {
                changes.end = utils.number.roundNumber(changes.end, 3);
              }

              const overlapProp =
                tt.overlap && ((scriptPrev && scriptPrev.end > tt.start) || (scriptNext && scriptNext.start < tt.end));

              newOverlap = tt.overlap !== overlapProp ? overlapProp : tt.overlap;
            }

            if (changes.profanityTag !== undefined && tt) {
              changes.ignoreProfanityTag = !changes.profanityTag;
              changes.profanityCheckDatas = utils.tt.updateProfanityCheckDatas(tt.profanityCheckDatas, 'untagged');
            }

            if (changes.text !== undefined && changes.style === undefined && tt) {
              changes.ignoreProfanityTag = false;

              // In teletext mode when text overflow number of rows, shift text upwards.
              if (changedTT.isTeletextModeEnabled) {
                let teletextPosition = utils.tags.convertPTagToTeletextTag(tt.pTag);

                let newLines = TextUtil.getLines(changes.text).length;
                let oldLines = TextUtil.getLines(tt.text).length;

                newLines = newLines ? newLines - 1 : 0;
                oldLines = oldLines ? oldLines - 1 : 0;

                if (teletextPosition + newLines > 12) {
                  if (newLines > oldLines) {
                    changes.pTag = utils.tags.convertTeletextTagToPTag(teletextPosition - 1);
                  }
                }
              }
            }

            revisionUpdates = updateRevisionChanges(revisionUpdates, timeChanges ? 'boxTimeChange' : 'propertyChange', {
              timedText: timedTexts[ttIndex],
              changes
            });

            if (changes.text !== undefined) {
              //reset SQC/Spell checked flags on text changes
              isQualityChecked = false;
              isSpellChecked = false;
              isSiblingConsistencyChecked = false;
              if (changedTT.isTeletextModeEnabled) {
                changes.text = utils.text.normalizeSiblingTags(changes.text);
              }
            }
            timedTexts[ttIndex] = {...tt, ...changes, overlap: newOverlap, style: null};

            if (timedTexts[ttIndex].isBoxSplitted) {
              timedTexts[ttIndex].subRows = timedTexts[ttIndex].subRows.map(subRow => {
                const numberOfLines = TextUtil.getLines(subRow.text).length;
                if (numberOfLines === 2) {
                  return subRow;
                }

                // @todo -> Change to maxLinesPerSubRow once we drop flex support.
                for (let index = numberOfLines; index < SubtitleSettings.MAX_SUB_ROW_LINES; index++) {
                  subRow.text += '\n';
                }

                return subRow;
              });

              timedTexts[ttIndex].text = timedTexts[ttIndex].subRows.reduce((text, subRow, index, subRows) => {
                return text + subRow.text + (index !== subRows.length - 1 ? '\n' : '');
              }, '');
            }

            if (
              SferaProject.getRuntimeConfig().revisionSignOffEnabled &&
              timedTexts[ttIndex] &&
              timedTexts[ttIndex].revisionUpdate &&
              !SferaProject.getRuntimeConfig().isSCRToSUBTask()
            ) {
              if (!utils.tt.compareRowsForRevisionSignOff(timedTexts[ttIndex].defaultState, timedTexts[ttIndex])) {
                timedTexts[ttIndex].revisionUpdate = false;
              }
            }
          }
        }

        return {
          ...track,
          isProfanityChecked,
          isQualityChecked,
          isSpellChecked,
          isSiblingConsistencyChecked,
          revisionUpdates,
          timedTexts
        };
      });

      return newState;
    },