/*
 * Copyright 2019 ThoughtWorks, Inc.
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

import {Environments, EnvironmentWithOrigin} from "models/new-environments/environments";
import test_data from "models/new-environments/spec/test_data";
import {Agents} from "models/new_agent/agents";
import {AgentsJSON} from "models/new_agent/agents_json";
import {AgentsTestData} from "models/new_agent/spec/agents_test_data";
import * as simulateEvent from "simulate-event";
import {EditAgentsModal} from "views/pages/new-environments/edit_agents_modal";
import {TestHelper} from "views/pages/spec/test_helper";

describe("Edit Agents Modal", () => {
  const helper = new TestHelper();

  let environment: EnvironmentWithOrigin,
      environments: Environments,
      agentsJSON: AgentsJSON;

  let normalAgentAssociatedWithEnvInXml: string,
      normalAgentAssociatedWithEnvInConfigRepo: string,
      elasticAgentAssociatedWithEnvInXml: string,
      unassociatedStaticAgent: string,
      unassociatedElasticAgent: string;

  let modal: EditAgentsModal;

  beforeEach(() => {
    jasmine.Ajax.install();

    environments          = new Environments();
    const environmentJSON = test_data.environment_json();
    environmentJSON.agents.push(test_data.agent_association_in_xml_json());

    environment = EnvironmentWithOrigin.fromJSON(environmentJSON);
    environments.push(environment);

    agentsJSON = AgentsTestData.list();

    agentsJSON._embedded.agents.push(AgentsTestData.elasticAgent());
    agentsJSON._embedded.agents.push(AgentsTestData.elasticAgent());

    //normal agent associated with environment in xml
    normalAgentAssociatedWithEnvInXml   = environmentJSON.agents[0].uuid;
    agentsJSON._embedded.agents[0].uuid = normalAgentAssociatedWithEnvInXml;

    //normal agent associated with environment in config repo
    normalAgentAssociatedWithEnvInConfigRepo = environmentJSON.agents[1].uuid;
    agentsJSON._embedded.agents[1].uuid      = normalAgentAssociatedWithEnvInConfigRepo;

    //elastic agent associated with environment in xml
    elasticAgentAssociatedWithEnvInXml  = environmentJSON.agents[2].uuid;
    agentsJSON._embedded.agents[4].uuid = elasticAgentAssociatedWithEnvInXml;

    unassociatedStaticAgent  = agentsJSON._embedded.agents[2].uuid;
    unassociatedElasticAgent = agentsJSON._embedded.agents[3].uuid;

    modal = new EditAgentsModal(environment, environments);
    modal.agentsVM.agents(Agents.fromJSON(agentsJSON));

    helper.mount(() => modal.body());
  });

  afterEach(() => {
    helper.unmount();
    jasmine.Ajax.uninstall();
  });

  it("should render available agents", () => {
    const availableAgentsSection = helper.byTestId(`available-agents`);
    const agent1Selector         = `agent-checkbox-for-${normalAgentAssociatedWithEnvInXml}`;
    const agent2Selector         = `agent-checkbox-for-${unassociatedStaticAgent}`;

    expect(availableAgentsSection).toBeInDOM();
    expect(availableAgentsSection).toContainText("Available Agents");
    expect(helper.byTestId(agent1Selector, availableAgentsSection)).toBeInDOM();
    expect(helper.byTestId(agent2Selector, availableAgentsSection)).toBeInDOM();
  });

  it("should render agents defined in config repo", () => {
    const configRepoAgentsSection = helper.byTestId(`agents-associated-with-this-environment-in-configuration-repository`);
    const agent1Selector          = `agent-checkbox-for-${normalAgentAssociatedWithEnvInConfigRepo}`;

    expect(configRepoAgentsSection).toBeInDOM();
    expect(configRepoAgentsSection)
      .toContainText("Agents associated with this environment in configuration repository");
    expect(helper.byTestId(agent1Selector, configRepoAgentsSection)).toBeInDOM();
  });

  it("should render elastic agents associated with the current environment", () => {
    const elasticAgentsSection = helper.byTestId(`elastic-agents-associated-with-this-environment`);
    const agent1Selector       = `agent-checkbox-for-${elasticAgentAssociatedWithEnvInXml}`;

    expect(elasticAgentsSection).toBeInDOM();
    expect(elasticAgentsSection).toContainText("Elastic Agents associated with this environment");
    expect(helper.byTestId(agent1Selector, elasticAgentsSection)).toBeInDOM();
  });

  it("should render unavailable elastic agents not belonging to the current environment", () => {
    const elasticAgentsSection = helper.byTestId(`unavailable-agents-elastic-agents`);
    const agent1Selector       = `agent-list-item-for-${unassociatedElasticAgent}`;

    expect(elasticAgentsSection).toBeInDOM();
    expect(elasticAgentsSection).toContainText("Unavailable Agents (Elastic Agents)");
    expect(helper.byTestId(agent1Selector, elasticAgentsSection)).toBeInDOM();
  });

  it("should toggle agent selection from environment on click", () => {
    const agent1Checkbox = helper.byTestId(`form-field-input-${normalAgentAssociatedWithEnvInXml}`) as HTMLInputElement;
    const agent2Checkbox = helper.byTestId(`form-field-input-${unassociatedStaticAgent}`) as HTMLInputElement;

    expect(agent1Checkbox.checked).toBe(true);
    expect(environment.containsAgent(normalAgentAssociatedWithEnvInXml)).toBe(true);

    expect(agent2Checkbox.checked).toBe(false);
    expect(environment.containsAgent(unassociatedStaticAgent)).toBe(false);

    simulateEvent.simulate(agent1Checkbox, "click");
    helper.redraw();

    expect(agent1Checkbox.checked).toBe(false);
    expect(environment.containsAgent(normalAgentAssociatedWithEnvInXml)).toBe(false);

    simulateEvent.simulate(agent2Checkbox, "click");
    helper.redraw();

    expect(agent2Checkbox.checked).toBe(true);
    expect(environment.containsAgent(unassociatedStaticAgent)).toBe(true);
  });

  it("should not allow toggling config repo agents", () => {
    const agent1Checkbox = helper.byTestId(`form-field-input-${normalAgentAssociatedWithEnvInConfigRepo}`) as HTMLInputElement;

    expect(agent1Checkbox.checked).toBe(true);
    expect(agent1Checkbox.disabled).toBe(true);
  });

  it("should not allow toggling elastic agents", () => {
    const agent1Checkbox = helper.byTestId(`form-field-input-${elasticAgentAssociatedWithEnvInXml}`) as HTMLInputElement;

    expect(agent1Checkbox.checked).toBe(true);
    expect(agent1Checkbox.disabled).toBe(true);
  });
});