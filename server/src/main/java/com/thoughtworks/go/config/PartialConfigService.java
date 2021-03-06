/*
 * Copyright 2020 ThoughtWorks, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.thoughtworks.go.config;

import com.thoughtworks.go.config.remote.ConfigRepoConfig;
import com.thoughtworks.go.config.remote.ConfigReposConfig;
import com.thoughtworks.go.config.remote.PartialConfig;
import com.thoughtworks.go.config.update.PartialConfigUpdateCommand;
import com.thoughtworks.go.server.service.GoConfigService;
import com.thoughtworks.go.serverhealth.HealthStateScope;
import com.thoughtworks.go.serverhealth.HealthStateType;
import com.thoughtworks.go.serverhealth.ServerHealthService;
import com.thoughtworks.go.serverhealth.ServerHealthState;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Set;

import static java.lang.String.format;

@Component
public class PartialConfigService implements PartialConfigUpdateCompletedListener, ChangedRepoConfigWatchListListener {
    public static final String INVALID_CRUISE_CONFIG_MERGE = "Invalid Merged Configuration";

    private final GoConfigService goConfigService;
    private final CachedGoPartials cachedGoPartials;
    private final ServerHealthService serverHealthService;
    private final PartialConfigHelper partialConfigHelper;
    private final GoConfigRepoConfigDataSource repoConfigDataSource;
    private final GoConfigWatchList configWatchList;

    @Autowired
    public PartialConfigService(GoConfigRepoConfigDataSource repoConfigDataSource,
                                GoConfigWatchList configWatchList, GoConfigService goConfigService,
                                CachedGoPartials cachedGoPartials, ServerHealthService serverHealthService, PartialConfigHelper partialConfigHelper) {
        this.repoConfigDataSource = repoConfigDataSource;
        this.configWatchList = configWatchList;
        this.goConfigService = goConfigService;
        this.cachedGoPartials = cachedGoPartials;
        this.serverHealthService = serverHealthService;
        this.partialConfigHelper = partialConfigHelper;

        this.configWatchList.registerListener(this);
        this.repoConfigDataSource.registerListener(this);
    }

    @Override
    public void onFailedPartialConfig(ConfigRepoConfig repoConfig, Exception ex) {
        // do nothing here, we keep previous version of part.
        // As an addition we should stop scheduling pipelines defined in that old part.
    }

    @Override
    public void onSuccessPartialConfig(ConfigRepoConfig repoConfig, PartialConfig incoming) {
        final String fingerprint = repoConfig.getRepo().getFingerprint();

        if (this.configWatchList.hasConfigRepoWithFingerprint(fingerprint)) {
            if (shouldMergePartial(incoming, fingerprint, repoConfig)) {
                // validate rules before attempting updateConfig() so that
                // rule violations will be considered before accepting a merge;
                // updateConfig() only considers structural validity.
                final boolean violatesRules = hasRuleViolations(incoming);

                cachedGoPartials.cacheAsLastKnown(fingerprint, incoming);

                if (updateConfig(incoming, fingerprint, repoConfig)) {
                    cachedGoPartials.markAsValid(fingerprint, incoming);
                } else {
                    final PartialConfig previousValidPartial = cachedGoPartials.getValid(repoConfig.getRepo().getFingerprint());

                    if (violatesRules && hasRuleViolations(previousValidPartial)) {
                        // do not allow fallback to the last version of the partial if the current rules do not allow
                        cachedGoPartials.removeValid(repoConfig.getRepo().getFingerprint());
                    }
                }
            }
        }
    }

    @Override
    public void onChangedRepoConfigWatchList(ConfigReposConfig newConfigRepos) {
        // remove partial configs from map which are no longer on the list
        Set<String> known = cachedGoPartials.getFingerprintToLatestKnownConfigMap().keySet();
        for (String fingerprint : known) {
            if (!newConfigRepos.hasMaterialWithFingerprint(fingerprint)) {
                cachedGoPartials.removeKnown(fingerprint);
            }
        }
        Set<String> valid = cachedGoPartials.getFingerprintToLatestValidConfigMap().keySet();
        for (String fingerprint : valid) {
            if (!newConfigRepos.hasMaterialWithFingerprint(fingerprint)) {
                cachedGoPartials.removeValid(fingerprint);
            }
        }
    }

    public CruiseConfig merge(PartialConfig partialConfig, String fingerprint, CruiseConfig cruiseConfig) {
        PartialConfigUpdateCommand command = buildUpdateCommand(partialConfig, fingerprint);
        command.update(cruiseConfig);
        return cruiseConfig;
    }

    protected PartialConfigUpdateCommand buildUpdateCommand(final PartialConfig partial, final String fingerprint) {
        return new PartialConfigUpdateCommand(partial, fingerprint, cachedGoPartials);
    }

    private boolean updateConfig(final PartialConfig newPart, final String fingerprint, ConfigRepoConfig repoConfig) {
        try {
            goConfigService.updateConfig(buildUpdateCommand(newPart, fingerprint));
            return true;
        } catch (Exception e) {
            if (repoConfig != null) {
                String description = format("%s- For Config Repo: %s", e.getMessage(), newPart.getOrigin().displayName());
                ServerHealthState state = ServerHealthState.error(INVALID_CRUISE_CONFIG_MERGE, description, HealthStateType.general(HealthStateScope.forPartialConfigRepo(repoConfig)));
                serverHealthService.update(state);
            }
            return false;
        }
    }

    private boolean shouldMergePartial(PartialConfig partial, String fingerprint, ConfigRepoConfig repoConfig) {
        return isPartialDifferentFromLastKnown(partial, fingerprint) ||
                repoConfigDataSource.hasConfigRepoConfigChangedSinceLastUpdate(repoConfig.getRepo());
    }

    /**
     * Tests whether a given {@link PartialConfig} is different from the last known cached attempt.
     *
     * @param partial     a {@link PartialConfig}
     * @param fingerprint the config repo material fingerprint ({@link String})
     * @return whether or not the incoming partial is different from the last cached partial
     */
    private boolean isPartialDifferentFromLastKnown(PartialConfig partial, String fingerprint) {
        final PartialConfig previous = cachedGoPartials.getKnown(fingerprint);

        return !partialConfigHelper.isEquivalent(previous, partial);
    }

    private boolean hasRuleViolations(PartialConfig partial) {
        if (null == partial) {
            return false;
        }

        partial.validatePermissionsOnSubtree();
        return partial.hasErrors();
    }
}
