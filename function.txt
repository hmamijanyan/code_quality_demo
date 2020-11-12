export function showTechCheckDeliveryOverlayWithParams() {
  return async (dispatch: IAppDispatch, getState: () => IAppState) => {
    const state = getState();
    const response = await backendSfera.techCheck.getJobsList(state.project.jobData.id);
    if (!response) {
      return;
    }
    dispatch(showTechCheckDeliveryOverlay());
    // Load each file track and collect list of jobs with all info
    let jobList: ITechCheckDeliveryJob[] = [];
    for (let jobData of response.jobsList) {
      let job: ITechCheckDeliveryJob = {
        userJobId: jobData.userJobId,
        title: jobData.fullJobName,
        status: jobData.techCheckStatus as TechCheckDeliveryJobStatus,
        projectJobId: jobData.projectJobId
      };

      const techCheckFile = selectors.projectFile.getTechCheckFile(state.project.files, jobData.userJobId);
      if (techCheckFile) {
        const techCheckFileExpositor = ProjectFile.get(techCheckFile);
        const isMultiStream = techCheckFileExpositor.isMultiStreamSubtitle();
        if (isMultiStream) {
          const techCheckTrack = await getTrack(job.userJobId, dispatch, getState);
          // additional info from the file / track for multi streams?
          const fixNeededType = TechCheckFixNeededType.AUTO;
          const fixNeededInfo: ITechCheckFixNeededInfo[] = [];
          const landCodes = utils.textTrack.getLangCodes(techCheckTrack);
          for (let langCode of landCodes) {
            const langName = LanguageUtil.getLanguageNameByCode(langCode) || langCode;
            const hasUnresolvedFlags = utils.tt.hasUnresolvedTechCheckFlags(techCheckTrack, langCode);
            fixNeededInfo.push({
              langName,
              langCode,
              disabled: hasUnresolvedFlags,
              checked: hasUnresolvedFlags
            });
          }

          job = {
            ...job,
            fixNeededInfo,
            isMultiStream,
            fixNeededType
          };
        }
      }

      jobList.push(job);
    }

    dispatch(
      changeTechCheckDeliveryOverlay({
        jobList,
        isLoading: false,
        isFinishing: false,
        jobStatuses: response && response.jobStatuses,
        statusToAll: response && response.jobStatuses[0].status
      })
    );
  };
}






// other function example

export async function runDeliveryChecks(
  textTrackEditable: ITextTrack,
  deliverySpec: IDeliverySpecs,
  runtime: IRuntimeConfig,
  workZone: IWorkZone,
  originalTextTrack?: ITextTrack,
  isAdminQc?: boolean,
  profanityWords: any[] = [],
  showTemplateChecks?: boolean,
  readOnlyTextTrack?: ITextTrack,
  supplementaryTextTrack?: ITextTrack,
  user?: IUserData
): Promise<DeliverySpecCheckResult> {
  const body = JSON.stringify({
    ...(textTrackEditable && {
      subtitle: {
        ...textTrackToServer(textTrackEditable), //
        ...(workZone.isSplit && {
          splitRange: {
            range: {
              minimum: workZone.start, //
              maximum: workZone.end
            }
          }
        })
      },
      subtitleRole: textTrackEditable.config && textTrackEditable.config.columnRole
    }),
    ...(originalTextTrack && {
      subtitleOriginal: textTrackToServer(originalTextTrack),
      subtitleOriginalRole: originalTextTrack.config && originalTextTrack.config.columnRole
    }),
    ...(readOnlyTextTrack && {
      subtitleReadOnly: textTrackToServer(readOnlyTextTrack),
      subtitleReadOnlyRole: readOnlyTextTrack.config && readOnlyTextTrack.config.columnRole
    }),
    specs: deliverySpecsToServer(utils.deliverySpecs.getAllSpecs(textTrackEditable) || [deliverySpec]),
    runtime: {
      ...runtimeToServer(runtime, JSON.stringify(SferaProject.getBaseTimeModel()), user),
      ...(workZone.isSplit && {isSplit: true})
      // ...{profanityWords}
      // isQCErrorCategorizationEnabled: runtimeConfig.isQCErrorCategorizationEnabled()
    },
    supplementaryData: await prepareSupplementaryData(supplementaryTextTrack, deliverySpec, runtime)
  });

  const data = await backendApiRequest('POST', 'runDeliveryChecks', body, {'Content-Type': 'application/json'});

  //if we have 2 column checks we should return result of second column check
  const index = originalTextTrack && !showTemplateChecks && data.length > 1 ? 1 : 0;

  // Cannot read property 'byRows' of undefined
  if (!data[index]) {
    return;
  }

  //remove null elements
  const globalResult =
    data[index] && data[index].fullSubtitleResults && data[index].fullSubtitleResults.filter(val => Boolean(val));

  // return the needed format for admin qc
  if (isAdminQc) {
    return data[index].allResults;
  }

  //merge global result with results by rows
  return {globalResult, ...data[index].byRows};
}
